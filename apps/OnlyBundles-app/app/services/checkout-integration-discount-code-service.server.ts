import type { authenticate } from "~/shopify.server";
import {
  CHECKOUT_INTEGRATION_PROVIDER_LABELS,
  type DiscountCodeCheckoutIntegrationProviderId,
} from "../lib/checkout-integrations";
import { AppLogger } from "../lib/logger";

type AdminApiContext = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

interface CheckoutIntegrationDiscountCodeResult {
  success: boolean;
  providerId: DiscountCodeCheckoutIntegrationProviderId;
  discountId?: string;
  code?: string;
  expiresAt?: string;
  functionId?: string;
  error?: string;
}

const DISCOUNT_FUNCTION_TITLE = "bundle-discount-function";

export const CHECKOUT_INTEGRATION_DISCOUNT_PREFIX = "WPB-";
export const CHECKOUT_INTEGRATION_DISCOUNT_CODE_TTL_MS = 30 * 60 * 1000;

export class CheckoutIntegrationDiscountCodeService {
  private static async getFunctionId(admin: AdminApiContext): Promise<string | null> {
    const QUERY = `
      query GetCheckoutIntegrationDiscountFunction {
        shopifyFunctions(first: 50) {
          edges {
            node {
              id
              title
              apiType
              description
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(QUERY);
      const data = await response.json() as any;
      const edges = data.data?.shopifyFunctions?.edges ?? [];
      const match = edges.find((edge: any) => {
        const fn = edge.node;
        return fn.title === DISCOUNT_FUNCTION_TITLE
          || fn.description === DISCOUNT_FUNCTION_TITLE;
      });

      return match?.node?.id ?? null;
    } catch (error: any) {
      AppLogger.warn("Failed to resolve checkout integration discount function", {
        component: "checkout-integration-discount-code",
        operation: "resolve-function",
      }, error);
      return null;
    }
  }

  private static async findExistingDiscount(
    admin: AdminApiContext,
    code: string,
  ): Promise<{ discountId: string; code: string; endsAt?: string | null } | null> {
    const QUERY = `
      query FindCheckoutIntegrationDiscountNode {
        discountNodes(first: 50) {
          nodes {
            id
            discount {
              __typename
              ... on DiscountCodeApp {
                title
                status
                codes(first: 10) {
                  nodes {
                    code
                  }
                }
                endsAt
              }
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(QUERY);
      const data = await response.json() as any;
      const nodes = data.data?.discountNodes?.nodes ?? [];
      const match = nodes.find((node: any) => {
        const discount = node.discount;
        if (discount?.__typename !== "DiscountCodeApp") return false;
        if (discount.status !== "ACTIVE") return false;
        const codeNodes = discount.codes?.nodes ?? [];
        return codeNodes.some((c: any) => c.code === code);
      });

      if (!match) return null;

      return {
        discountId: match.id,
        code,
        endsAt: match.discount.endsAt,
      };
    } catch (error: any) {
      AppLogger.warn("Failed to find existing checkout integration discount", {
        component: "checkout-integration-discount-code",
        operation: "find-existing",
      }, error);
      return null;
    }
  }

  private static buildCode(providerId: DiscountCodeCheckoutIntegrationProviderId): string {
    return `${CHECKOUT_INTEGRATION_DISCOUNT_PREFIX}${providerId.toUpperCase()}`;
  }

  static async createForProvider(
    admin: AdminApiContext,
    shopDomain: string,
    providerId: DiscountCodeCheckoutIntegrationProviderId,
  ): Promise<CheckoutIntegrationDiscountCodeResult> {
    const functionId = await this.getFunctionId(admin);
    if (!functionId) {
      return {
        success: false,
        providerId,
        error: `Discount function '${DISCOUNT_FUNCTION_TITLE}' not found - has the app been deployed?`,
      };
    }

    const code = this.buildCode(providerId);
    const existing = await this.findExistingDiscount(admin, code);
    if (existing) {
      return {
        success: true,
        providerId,
        functionId,
        discountId: existing.discountId,
        code: existing.code,
        expiresAt: existing.endsAt ?? undefined,
      };
    }

    const providerLabel = CHECKOUT_INTEGRATION_PROVIDER_LABELS[providerId];
    const now = Date.now();
    const startsAt = new Date(now - 60 * 1000).toISOString();

    const MUTATION = `
      mutation CreateCheckoutIntegrationCode($codeAppDiscount: DiscountCodeAppInput!) {
        discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
          codeAppDiscount {
            discountId
            endsAt
            codes(first: 1) {
              nodes {
                code
              }
            }
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(MUTATION, {
        variables: {
          codeAppDiscount: {
            title: `WPB checkout integration - ${providerLabel}`,
            code,
            functionId,
            startsAt,
            appliesOncePerCustomer: false,
            discountClasses: ["PRODUCT"],
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: true,
              shippingDiscounts: false,
            },
            metafields: [{
              namespace: "$app",
              key: "checkout_integration_config",
              type: "json",
              value: JSON.stringify({
                mode: "checkout_integration",
                providerId,
                shopDomain,
              }),
            }],
          },
        },
      });
      const data = await response.json() as any;

      if (data.errors) {
        return {
          success: false,
          providerId,
          functionId,
          error: `GraphQL errors: ${data.errors.map((error: any) => error.message).join(", ")}`,
        };
      }

      const payload = data.data?.discountCodeAppCreate;
      const userErrors = payload?.userErrors ?? [];
      if (userErrors.length > 0) {
        const isCodeTaken = userErrors.some((err: any) => {
          const msg = err.message?.toLowerCase() ?? "";
          return msg.includes("already exists")
            || msg.includes("unique")
            || msg.includes("taken");
        });
        if (isCodeTaken) {
          const recovered = await this.findExistingDiscount(admin, code);
          if (recovered) {
            return {
              success: true,
              providerId,
              functionId,
              discountId: recovered.discountId,
              code: recovered.code,
              expiresAt: recovered.endsAt ?? undefined,
            };
          }
        }

        return {
          success: false,
          providerId,
          functionId,
          error: `User errors: ${userErrors.map((error: any) => error.message).join(", ")}`,
        };
      }

      return {
        success: true,
        providerId,
        functionId,
        discountId: payload?.codeAppDiscount?.discountId,
        code: payload?.codeAppDiscount?.codes?.nodes?.[0]?.code ?? code,
        expiresAt: payload?.codeAppDiscount?.endsAt ?? undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        providerId,
        functionId,
        error: error instanceof Error ? error.message : "Unknown checkout integration discount code error",
      };
    }
  }
}
