import db from "../../db.server";
import { BundleType } from "../../constants/bundle";
import type { ShopifyAdmin } from "../../shopify.server";
import { CartTransformService } from "../cart-transform-service.server";
import {
  updateBundleProductMetafields,
} from "./metafield-sync/operations/bundle-product.server";
import { syncThemeColors } from "../theme-colors.server";
import { buildFullPageBundleMetafieldConfig } from "../../routes/app/app.bundles.full-page-bundle.configure.$bundleId/handlers/shared.server";
import {
  buildSyncBundleConfiguration,
} from "../../routes/app/app.bundles.product-page-bundle.configure.$bundleId/handlers/runtime-config.server";
import { ensureBundleParentProduct } from "./bundle-parent-product.server";
import { syncPpbStorefrontRuntime } from "../ppb-storefront-runtime.server";
import { syncFpbStorefrontRuntime } from "../fpb-storefront-runtime.server";
import { resolveFpbTemplateSelection } from "../../lib/fpb-template-selection";

export type StorefrontSyncReason = "save" | "retry" | "sync_bundle" | "downgrade";

async function loadBundleForStorefrontSync(shopDomain: string, bundleId: string) {
  return (db.bundle as any).findUnique({
    where: { id: bundleId, shopId: shopDomain },
    include: {
      steps: {
        include: {
          StepProduct: { orderBy: { position: "asc" } },
          StepCategory: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { position: "asc" },
      },
      pricing: true,
      offerPolicy: {
        select: {
          specificLinkRequired: true,
          priority: true,
          stopLowerPriority: true,
          scheduleMode: true,
          startsAt: true,
          endsAt: true,
          recurrenceFrequency: true,
          recurrenceTimezone: true,
          recurrenceAnchorDate: true,
          recurrenceWindowStartMinute: true,
          recurrenceWindowEndMinute: true,
          recurrenceTermination: true,
          recurrenceEndsOn: true,
          recurrenceRunCount: true,
          countryTargetingEnabled: true,
          countryTargetingMode: true,
          countryCodes: true,
          ruleVersion: true,
        },
      },
    },
  });
}

async function normalizeBundleForStorefrontSync(bundle: any) {
  if (bundle?.bundleType !== BundleType.FULL_PAGE) return bundle;
  const selection = resolveFpbTemplateSelection(bundle);
  if (
    selection.bundleDesignTemplate === bundle.bundleDesignTemplate
    && selection.bundleDesignPresetId === bundle.bundleDesignPresetId
  ) {
    return bundle;
  }
  await (db.bundle as any).update({
    where: { id: bundle.id },
    data: selection,
  });
  return { ...bundle, ...selection };
}

async function syncFullPageBundleFromDb(
  admin: ShopifyAdmin,
  shopDomain: string,
  bundle: any,
) {
  const stats = {
    bundleType: BundleType.FULL_PAGE,
    productMetafields: false,
    proxyHost: true,
  };

  if (!bundle.shopifyProductId) {
    return stats;
  }

  await ensureBundleParentProduct({
    admin,
    shopDomain,
    appUrl: process.env.SHOPIFY_APP_URL,
    bundle,
  });

  const bundleConfig = buildFullPageBundleMetafieldConfig(bundle);
  await updateBundleProductMetafields(admin, bundle.shopifyProductId, bundleConfig);
  stats.productMetafields = true;
  return stats;
}

async function syncProductPageBundleFromDb(
  admin: ShopifyAdmin,
  shopDomain: string,
  bundle: any,
) {
  const stats = {
    bundleType: BundleType.PRODUCT_PAGE,
    productMetafields: false,
    productState: false,
  };

  if (!bundle.shopifyProductId) {
    return stats;
  }

  await ensureBundleParentProduct({
    admin,
    shopDomain,
    appUrl: process.env.SHOPIFY_APP_URL,
    bundle,
  });

  stats.productState = true;

  const bundleConfig = buildSyncBundleConfiguration(bundle, bundle.shopifyProductId);
  await updateBundleProductMetafields(admin, bundle.shopifyProductId, bundleConfig);
  stats.productMetafields = true;
  return stats;
}

async function ensureCartTransformReady(admin: ShopifyAdmin, shopDomain: string) {
  const activation = await CartTransformService.completeSetup(admin, shopDomain);
  if (!activation.success) {
    throw new Error(activation.error ?? "Cart Transform activation failed");
  }
  return activation;
}

export async function prepareShopStorefrontSync(input: {
  admin: ShopifyAdmin;
  shopDomain: string;
  proxyRoot?: string;
  bundleTypes?: Array<"full_page" | "product_page">;
}) {
  const activation = await ensureCartTransformReady(input.admin, input.shopDomain);

  await syncThemeColors(input.shopDomain);
  const bundleTypes = new Set(input.bundleTypes ?? ["full_page", "product_page"]);
  if (bundleTypes.has("product_page")) {
    await syncPpbStorefrontRuntime(input.admin, input.shopDomain, input.proxyRoot);
  }
  if (bundleTypes.has("full_page")) {
    await syncFpbStorefrontRuntime(input.admin, input.shopDomain);
  }
  return {
    activation,
    themeColors: true,
    ppbRuntime: bundleTypes.has("product_page"),
    fpbRuntime: bundleTypes.has("full_page"),
  };
}

async function performBundleStorefrontDataSync(
  admin: ShopifyAdmin,
  input: {
    shopDomain: string;
    bundleId: string;
    bundleType: "full_page" | "product_page";
    reason: StorefrontSyncReason;
  },
  prepareShop = false,
) {
  const loadedBundle = await loadBundleForStorefrontSync(input.shopDomain, input.bundleId);
  if (!loadedBundle) {
    throw new Error("Bundle not found");
  }

  if (prepareShop) {
    if (loadedBundle.shopifyProductId) {
      await prepareShopStorefrontSync({
        admin,
        shopDomain: input.shopDomain,
        bundleTypes: [input.bundleType],
      });
    } else {
      await ensureCartTransformReady(admin, input.shopDomain);
    }
  }

  const bundle = await normalizeBundleForStorefrontSync(loadedBundle);

  const stats =
    input.bundleType === BundleType.FULL_PAGE
      ? await syncFullPageBundleFromDb(admin, input.shopDomain, bundle)
      : await syncProductPageBundleFromDb(admin, input.shopDomain, bundle);

  return { skipped: false, synced: true, stats };
}

export async function syncBundleStorefrontDataNow(input: {
  admin: ShopifyAdmin;
  shopDomain: string;
  bundleId: string;
  bundleType: "full_page" | "product_page";
  reason: StorefrontSyncReason;
}) {
  return performBundleStorefrontDataSync(input.admin, input);
}

export async function syncBundleStorefrontNow(input: {
  admin: ShopifyAdmin;
  shopDomain: string;
  bundleId: string;
  bundleType: "full_page" | "product_page";
  reason: StorefrontSyncReason;
}) {
  return performBundleStorefrontDataSync(input.admin, {
    shopDomain: input.shopDomain,
    bundleId: input.bundleId,
    bundleType: input.bundleType,
    reason: input.reason,
  }, true);
}

export function compactBundleForConfigureResponse(bundle: any) {
  return {
    id: bundle.id,
    publicNumber: bundle.publicNumber ?? null,
    bundleType: bundle.bundleType,
    status: bundle.status,
    name: bundle.name,
    description: bundle.description ?? null,
    shopifyProductId: bundle.shopifyProductId ?? null,
    shopifyProductHandle: bundle.shopifyProductHandle ?? null,
  };
}
