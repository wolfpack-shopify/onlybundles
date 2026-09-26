/**
 * Lifecycle Webhook Handlers
 *
 * Handles app lifecycle webhooks delivered through Remix ingress and Inngest:
 * - app/uninstalled
 * - app/scopes_update
 *
 * Note: These handlers do NOT have access to the Shopify admin API
 * because background processing does not carry an authenticated Admin API context.
 * Metafield cleanup is handled automatically by Shopify when an app
 * is uninstalled ($app namespace metafields are deleted by Shopify).
 * These handlers focus on database cleanup only.
 */

import db from "../../../db.server";
import { AppLogger } from "../../../lib/logger";
import { getCachedShopifyShopGid, recordBusinessEvent } from "../../app-events.server";
import { cleanupShopData } from "../../shop-data-cleanup.server";
import type { WebhookProcessResult } from "../types";

/**
 * Handle app/uninstalled webhook
 *
 * Performs comprehensive database cleanup when a merchant uninstalls the app.
 * Metafield cleanup is NOT done here because we don't have admin API access
 * in this background handler. Shopify automatically deletes $app namespace metafields on uninstall.
 *
 * Operations are idempotent - safe to run multiple times.
 */
export async function handleAppUninstalled(
  shopDomain: string,
  payload: any,
  currentWebhookEventId?: string
): Promise<WebhookProcessResult> {
  try {
    AppLogger.info("Processing app uninstall", {
      component: "webhook-processor",
      operation: "handleAppUninstalled",
    }, { shop: shopDomain });

    const shopifyShopGid = await getCachedShopifyShopGid(shopDomain);

    const cleanup = await cleanupShopData(shopDomain, {
      currentWebhookEventId,
      purgeAnalytics: false,
    });

    AppLogger.info("Deleted bundles", {
      component: "webhook-processor",
      operation: "handleAppUninstalled",
    }, { shop: shopDomain, count: cleanup.bundles });

    await recordBusinessEvent({
      eventHandle: "app_uninstalled",
      shopDomain,
      shopifyShopGid,
      surface: "webhook",
      actor: "webhook",
      routeFamily: "lifecycle_webhook",
      result: "success",
      attributes: {
        topic: "APP_UNINSTALLED",
      },
    });

    AppLogger.info("App uninstall cleanup completed", {
      component: "webhook-processor",
      operation: "handleAppUninstalled",
    }, { shop: shopDomain, bundlesDeleted: cleanup.bundles });

    return {
      success: true,
      message: `App uninstalled, cleaned up ${cleanup.bundles} bundles and all shop data`,
    };
  } catch (error: any) {
    AppLogger.error("Error handling app uninstall", {
      component: "webhook-processor",
      operation: "handleAppUninstalled",
    }, error);

    return {
      success: false,
      message: "Error handling app uninstall",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Handle app/scopes_update webhook
 *
 * Updates the session scope when app permissions change.
 */
export async function handleScopesUpdate(
  shopDomain: string,
  payload: any
): Promise<WebhookProcessResult> {
  try {
    const currentScopes = payload.current;

    if (!currentScopes || !Array.isArray(currentScopes)) {
      return {
        success: false,
        message: "Missing or invalid current scopes in payload",
        error: "payload.current must be an array",
      };
    }

    AppLogger.info("Processing scopes update", {
      component: "webhook-processor",
      operation: "handleScopesUpdate",
    }, { shop: shopDomain, scopes: currentScopes });

    // Update all sessions for this shop with the current Shopify scopes.
    const updated = await db.session.updateMany({
      where: { shop: shopDomain },
      data: {
        scope: currentScopes.toString(),
      },
    });

    AppLogger.info("Updated session scopes", {
      component: "webhook-processor",
      operation: "handleScopesUpdate",
    }, { shop: shopDomain, sessionsUpdated: updated.count });

    return {
      success: true,
      message: `Updated ${updated.count} session scopes`,
    };
  } catch (error: any) {
    AppLogger.error("Error handling scopes update", {
      component: "webhook-processor",
      operation: "handleScopesUpdate",
    }, error);

    return {
      success: false,
      message: "Error handling scopes update",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
