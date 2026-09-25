// Cart Transform Automatic Activation Service
import type { authenticate } from "~/shopify.server";
import { AppLogger } from "../lib/logger";

type AdminApiContext = Awaited<ReturnType<typeof authenticate.admin>>['admin'];

interface CartTransformActivationResult {
  success: boolean;
  cartTransformId?: string;
  error?: string;
  alreadyExists?: boolean;
}

interface CartTransformMetafieldSyncResult {
  success: boolean;
  cartTransformId?: string;
  error?: string;
}

const RUST_FUNCTION_HANDLE = 'bundle-cart-transform-rs';

type CartTransformLookup =
  | {
      success: true;
      exists: boolean;
      id?: string;
      functionId?: string;
      blockOnFailure?: boolean;
    }
  | {
      success: false;
      error: string;
    };

export class CartTransformService {
  /**
   * Resolve the live Shopify function ID for the Rust cart transform handle.
   * Uses the stable `shopifyFunctions` query — avoids hardcoding a UUID that
   * changes between app deployments.
   */
  private static async getRustFunctionId(admin: AdminApiContext): Promise<string | null> {
    const QUERY = `
      query GetShopifyFunctions {
        shopifyFunctions(first: 25) {
          nodes {
            id
            handle
            apiType
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(QUERY);
      const data = await response.json() as any;
      if (data.errors) return null;
      const functions = data.data?.shopifyFunctions?.nodes || [];
      const match = functions.find((fn: any) => (
        fn.apiType === 'cart_transform'
        && fn.handle === RUST_FUNCTION_HANDLE
      ));
      return match?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Delete a CartTransform by its Shopify GID.
   */
  private static async deleteCartTransform(admin: AdminApiContext, id: string): Promise<boolean> {
    const MUTATION = `
      mutation DeleteCartTransform($id: ID!) {
        cartTransformDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(MUTATION, { variables: { id } });
      const data = await response.json() as any;
      const deletion = data.data?.cartTransformDelete;
      if (
        data.errors
        || deletion?.userErrors?.length > 0
        || deletion?.deletedId !== id
      ) {
        AppLogger.warn('Failed to delete CartTransform', {
          component: 'cart-transform',
          operation: 'delete'
        }, {
          id,
          deletedId: deletion?.deletedId,
          errors: data.errors ?? deletion?.userErrors,
        });
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check existing CartTransforms for this shop.
   * Returns all transforms so the caller can decide whether to replace them.
   */
  private static async checkExistingCartTransform(
    admin: AdminApiContext
  ): Promise<CartTransformLookup> {
    const CHECK_EXISTING_QUERY = `
      query CheckExistingCartTransform {
        cartTransforms(first: 5) {
          edges {
            node {
              id
              functionId
              blockOnFailure
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(CHECK_EXISTING_QUERY);
      if (response.ok === false) {
        return {
          success: false,
          error: `Cart transform lookup failed with HTTP ${response.status}`,
        };
      }
      const data = await response.json() as any;

      if (data.errors) {
        AppLogger.warn('Error checking existing cart transforms', {
          component: 'cart-transform',
          operation: 'check-existing'
        }, data.errors);
        return {
          success: false,
          error: data.errors.map((error: any) => error.message).join(', '),
        };
      }

      const existingTransform = data.data?.cartTransforms?.edges?.[0];
      return {
        success: true,
        exists: !!existingTransform,
        id: existingTransform?.node?.id,
        functionId: existingTransform?.node?.functionId,
        blockOnFailure: existingTransform?.node?.blockOnFailure,
      };
    } catch (error: any) {
      AppLogger.warn('Error checking existing cart transforms', {
        component: 'cart-transform',
        operation: 'check-existing'
      }, error);
      return {
        success: false,
        error: error instanceof Error
          ? error.message
          : 'Cart transform lookup failed',
      };
    }
  }

  /**
   * Create cart transform object using functionHandle (2025-10+ API).
   */
  private static async createCartTransform(
    admin: AdminApiContext,
    functionHandle: string
  ): Promise<CartTransformActivationResult> {
    const CREATE_CART_TRANSFORM_MUTATION = `
      mutation CreateCartTransform($functionHandle: String!, $blockOnFailure: Boolean!) {
        cartTransformCreate(
          functionHandle: $functionHandle
          blockOnFailure: $blockOnFailure
        ) {
          cartTransform {
            id
            functionId
            blockOnFailure
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(CREATE_CART_TRANSFORM_MUTATION, {
        variables: { functionHandle, blockOnFailure: false }
      });
      const data = await response.json() as any;

      if (data.errors) {
        return {
          success: false,
          error: `GraphQL errors: ${data.errors.map((e: any) => e.message).join(', ')}`
        };
      }

      const { cartTransformCreate } = data.data;

      if (cartTransformCreate.userErrors?.length > 0) {
        return {
          success: false,
          error: `User errors: ${cartTransformCreate.userErrors.map((e: any) => e.message).join(', ')}`
        };
      }

      return {
        success: true,
        cartTransformId: cartTransformCreate.cartTransform.id
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during cart transform creation'
      };
    }
  }

  /**
   * Activate the Rust cart transform for a shop.
   *
   * Handles three cases:
   * 1. No CartTransform exists → create new with Rust handle
   * 2. CartTransform uses Rust with graceful degradation → skip (already correct)
   * 3. CartTransform uses Rust with failure blocking → delete and recreate safely
   * 4. CartTransform points to another function → delete stale and recreate safely
   *
   * This replaces the old "exists → skip" logic which silently left merchants
   * on the dead TS function after the Rust migration.
   */
  static async activateForNewInstallation(
    admin: AdminApiContext,
    shopDomain: string
  ): Promise<CartTransformActivationResult> {
    AppLogger.info('Activating cart transform for shop', {
      component: 'cart-transform',
      operation: 'activate'
    }, { shopDomain });

    try {
      // Resolve live Rust function ID so we can detect stale transforms
      const rustFunctionId = await this.getRustFunctionId(admin);

      if (!rustFunctionId) {
        const errorMsg = `Rust function handle '${RUST_FUNCTION_HANDLE}' not found — has the app been deployed?`;
        AppLogger.error(errorMsg, { component: 'cart-transform', operation: 'activate' });
        return { success: false, error: errorMsg };
      }

      const existingCheck = await this.checkExistingCartTransform(admin);

      if (!existingCheck.success) {
        return {
          success: false,
          error: `Could not inspect existing CartTransform: ${existingCheck.error}`,
        };
      }

      if (existingCheck.exists) {
        if (
          existingCheck.functionId === rustFunctionId &&
          existingCheck.blockOnFailure === false
        ) {
          AppLogger.info('Cart transform already uses graceful-degradation Rust function', {
            component: 'cart-transform',
            operation: 'activate'
          }, { shopDomain, cartTransformId: existingCheck.id });
          return { success: true, cartTransformId: existingCheck.id, alreadyExists: true };
        }

        AppLogger.info('Blocking or stale CartTransform found — replacing with graceful-degradation Rust version', {
          component: 'cart-transform',
          operation: 'activate'
        }, {
          shopDomain,
          staleId: existingCheck.id,
          staleFunctionId: existingCheck.functionId,
          staleBlockOnFailure: existingCheck.blockOnFailure,
        });

        const deleted = await this.deleteCartTransform(admin, existingCheck.id!);
        if (!deleted) {
          return {
            success: false,
            cartTransformId: existingCheck.id,
            error: 'Could not replace blocking CartTransform',
          };
        }
      }

      // Create fresh CartTransform for the Rust function
      const result = await this.createCartTransform(admin, RUST_FUNCTION_HANDLE);

      if (result.success) {
        AppLogger.info('Successfully activated Rust cart transform', {
          component: 'cart-transform',
          operation: 'activate'
        }, { shopDomain, cartTransformId: result.cartTransformId });
      } else {
        AppLogger.error('Failed to activate cart transform', {
          component: 'cart-transform',
          operation: 'activate'
        }, { shopDomain, error: result.error });
      }

      return result;
    } catch (error: any) {
      AppLogger.error('Error during cart transform activation', {
        component: 'cart-transform',
        operation: 'activate'
      }, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during cart transform activation'
      };
    }
  }

  /**
   * Complete setup - activate cart transform
   */
  static async completeSetup(
    admin: AdminApiContext,
    shopDomain: string
  ): Promise<CartTransformActivationResult> {
    AppLogger.info('Starting complete cart transform setup', {
      component: 'cart-transform',
      operation: 'complete-setup'
    }, { shopDomain });

    const result = await this.activateForNewInstallation(admin, shopDomain);

    if (result.success && result.cartTransformId) {
      const configurationSync = await this.syncRuntimeConfiguration(admin, shopDomain, result.cartTransformId);
      if (!configurationSync.success) {
        return {
          success: false,
          cartTransformId: result.cartTransformId,
          error: configurationSync.error ?? 'Runtime configuration sync failed',
        };
      }
    }

    if (result.success) {
      AppLogger.info('Complete setup finished', {
        component: 'cart-transform',
        operation: 'complete-setup'
      }, { shopDomain });
    } else {
      AppLogger.error('Setup failed', {
        component: 'cart-transform',
        operation: 'complete-setup'
      }, { shopDomain, error: result.error });
    }

    return result;
  }

  private static async syncRuntimeConfiguration(
    admin: AdminApiContext,
    shopDomain: string,
    cartTransformId: string,
  ): Promise<CartTransformMetafieldSyncResult> {
    try {
      const CURRENT_CONFIGURATION_QUERY = `
        query CartTransformRuntimeConfiguration($id: ID!) {
          node(id: $id) {
            ... on CartTransform {
              runtimeConfiguration: metafield(namespace: "$app", key: "runtime_configuration") {
                value
              }
            }
          }
        }
      `;
      const currentResponse = await admin.graphql(CURRENT_CONFIGURATION_QUERY, {
        variables: { id: cartTransformId },
      });
      const currentData = await currentResponse.json() as any;
      if (currentData.errors) {
        const message = currentData.errors.map((error: any) => error.message).join(', ');
        return { success: false, cartTransformId, error: message };
      }
      const currentValue = currentData.data?.node?.runtimeConfiguration?.value;
      let currentConfiguration: Record<string, unknown> = {};
      if (typeof currentValue === 'string' && currentValue.trim() !== '') {
        try {
          const parsed = JSON.parse(currentValue);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Cart Transform runtime configuration must be a JSON object');
          }
          currentConfiguration = parsed;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid Cart Transform runtime configuration';
          return { success: false, cartTransformId, error: message };
        }
      }
      const MUTATION = `
        mutation SyncRuntimeConfiguration($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              key
              namespace
              value
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;
      const response = await admin.graphql(MUTATION, {
        variables: {
          metafields: [{
            ownerId: cartTransformId,
            namespace: '$app',
            key: 'runtime_configuration',
            type: 'json',
            value: JSON.stringify({
              bundleCartLineMessaging: currentConfiguration.bundleCartLineMessaging ?? null,
            }),
          }],
        },
      });
      const data = await response.json() as any;
      const errors = data.data?.metafieldsSet?.userErrors ?? [];
      if (data.errors || errors.length > 0) {
        const message = data.errors
          ? data.errors.map((error: any) => error.message).join(', ')
          : errors.map((error: any) => error.message).join(', ');
        AppLogger.error('Failed to sync runtime configuration metafield', {
          component: 'cart-transform',
          operation: 'sync-runtime-configuration'
        }, { shopDomain, errors: data.errors ?? errors });
        return { success: false, cartTransformId, error: message };
      }
      return { success: true, cartTransformId };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown runtime configuration sync error';
      AppLogger.error('Error syncing runtime configuration metafield', {
        component: 'cart-transform',
        operation: 'sync-runtime-configuration'
      }, { shopDomain, error: message });
      return { success: false, cartTransformId, error: message };
    }
  }

  static async syncCartLineMessagingSettings(
    admin: AdminApiContext,
    shopDomain: string,
    settings: unknown
  ): Promise<CartTransformMetafieldSyncResult> {
    try {
      const rustFunctionId = await this.getRustFunctionId(admin);
      if (!rustFunctionId) {
        const errorMsg = `Rust function handle '${RUST_FUNCTION_HANDLE}' not found — has the app been deployed?`;
        AppLogger.error(errorMsg, {
          component: 'cart-transform',
          operation: 'sync-cart-line-messaging'
        }, { shopDomain });
        return { success: false, error: errorMsg };
      }

      const existingCheck = await this.checkExistingCartTransform(admin);
      if (!existingCheck.success) {
        return {
          success: false,
          error: `Could not inspect existing CartTransform: ${existingCheck.error}`,
        };
      }

      let cartTransformId = existingCheck.functionId === rustFunctionId
        ? existingCheck.id
        : undefined;
      if (!cartTransformId || existingCheck.blockOnFailure !== false) {
        const activation = await this.activateForNewInstallation(admin, shopDomain);
        if (!activation.success || !activation.cartTransformId) {
          return { success: false, error: activation.error ?? 'Cart transform activation failed' };
        }
        cartTransformId = activation.cartTransformId;
      }

      const MUTATION = `
        mutation SyncCartLineMessagingSettings($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              key
              namespace
              value
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      const response = await admin.graphql(MUTATION, {
        variables: {
          metafields: [{
            ownerId: cartTransformId,
            namespace: '$app',
            key: 'runtime_configuration',
            type: 'json',
            value: JSON.stringify({
              bundleCartLineMessaging: settings ?? null,
            }),
          }],
        },
      });
      const data = await response.json() as any;
      const errors = data.data?.metafieldsSet?.userErrors ?? [];
      if (data.errors || errors.length > 0) {
        const message = data.errors
          ? data.errors.map((error: any) => error.message).join(', ')
          : errors.map((error: any) => error.message).join(', ');
        AppLogger.error('Failed to sync cart line messaging metafield', {
          component: 'cart-transform',
          operation: 'sync-cart-line-messaging'
        }, { shopDomain, errors: data.errors ?? errors });
        return { success: false, cartTransformId, error: message };
      }

      return { success: true, cartTransformId };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown cart transform metafield sync error';
      AppLogger.error('Error syncing cart line messaging metafield', {
        component: 'cart-transform',
        operation: 'sync-cart-line-messaging'
      }, { shopDomain, error: message });
      return { success: false, error: message };
    }
  }
}
