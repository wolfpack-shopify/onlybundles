import { json } from "@remix-run/node";
import type { Session } from "@shopify/shopify-api";
import type { ShopifyAdmin } from "../../../../shopify.server";
import db from "../../../../db.server";
import { resolveShopEntitlements } from "../../../../services/subscriptions/subscription-service.server";
import { assertTemplateSelectionAllowed } from "../../../../services/subscriptions/bundle-entitlement-gate.server";
import { EntitlementDeniedError, isFreeTemplate } from "../../../../lib/subscriptions/entitlements";
import {
  BundleTemplateSnapshotConflictError,
  BundleTemplateSnapshotUnavailableError,
  syncBundleTemplateSnapshot,
} from "../../../../services/bundles/metafield-sync/operations/bundle-template.server";

export async function handleUpdateBundleDesignTemplate(
  admin: ShopifyAdmin,
  session: Session,
  bundleId: string,
  formData: FormData,
) {
  const bundleDesignTemplate =
    (formData.get("bundleDesignTemplate") as string)?.trim() || null;
  const bundleDesignPresetId =
    (formData.get("bundleDesignPresetId") as string)?.trim() || null;

  const currentBundle = await db.bundle.findUnique({
    where: { id: bundleId, shopId: session.shop },
    select: {
      bundleDesignTemplate: true,
      bundleDesignPresetId: true,
      shopifyProductId: true,
    },
  });
  if (!currentBundle) {
    return json({ success: false, error: "Bundle not found" }, { status: 404 });
  }

  const selectionChanged =
    currentBundle.bundleDesignTemplate !== bundleDesignTemplate
    || currentBundle.bundleDesignPresetId !== bundleDesignPresetId;

  if (selectionChanged) {
    const freeTemplate = isFreeTemplate({
      bundleType: "FULL_PAGE",
      designTemplate: bundleDesignTemplate,
      designPresetId: bundleDesignPresetId,
    });
    const entitlementContext = freeTemplate
      ? null
      : await resolveShopEntitlements({ shopDomain: session.shop });

    try {
      assertTemplateSelectionAllowed({
        bundleType: "FULL_PAGE",
        designTemplate: bundleDesignTemplate,
        designPresetId: bundleDesignPresetId,
        entitlements: entitlementContext?.entitlements ?? null,
      });
    } catch (error) {
      if (error instanceof EntitlementDeniedError) {
        return json(
          {
            success: false,
            error: "The selected template requires the Growth plan.",
            entitlementFailure: error.toJSON(),
          },
          { status: 403 },
        );
      }
      throw error;
    }

    await db.bundle.update({
      where: { id: bundleId, shopId: session.shop },
      data: { bundleDesignTemplate, bundleDesignPresetId },
    });
  }

  if (currentBundle.shopifyProductId) {
    try {
      await syncBundleTemplateSnapshot({
        admin,
        bundleProductId: currentBundle.shopifyProductId,
        bundleId,
        bundleType: "full_page",
        bundleDesignTemplate,
        bundleDesignPresetId,
      });
    } catch (error) {
      if (error instanceof BundleTemplateSnapshotUnavailableError) {
        return json({
          success: false,
          error: error.message,
          syncRequired: true,
          templatePersisted: true,
        }, { status: 409 });
      }
      if (error instanceof BundleTemplateSnapshotConflictError) {
        return json({ success: false, error: error.message }, { status: 409 });
      }
      throw error;
    }
  }

  return json({ success: true });
}
