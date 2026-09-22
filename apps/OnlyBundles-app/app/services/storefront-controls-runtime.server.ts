import { prisma } from "../db.server";
import {
  SETTINGS_CONTROLS_SCHEMA_VERSION,
  buildSettingsControlsRuntime,
  type SettingsControlsRuntime,
} from "../lib/settings-controls-runtime";

const STOREFRONT_CONTROLS_JSON_LIMIT_BYTES = 128 * 1024;

type Admin = {
  graphql: (...args: any[]) => Promise<{ json: () => Promise<any> }>;
};

export function assertStorefrontControlsRuntimeSize(runtime: SettingsControlsRuntime) {
  const size = Buffer.byteLength(JSON.stringify(runtime), "utf8");
  if (size > STOREFRONT_CONTROLS_JSON_LIMIT_BYTES) {
    throw new Error(`storefront_controls_runtime exceeds Shopify's 128KB JSON limit (${size} bytes)`);
  }
  return size;
}

async function resolveShopGid(admin: Admin) {
  const response = await admin.graphql(`query StorefrontControlsShop { shop { id } }`);
  const data = await response.json();
  const shopId = data.data?.shop?.id;
  if (data.errors?.length || typeof shopId !== "string" || !shopId) {
    throw new Error(data.errors?.[0]?.message ?? "Unable to resolve Shopify Shop ID for Controls runtime sync");
  }
  return shopId;
}

async function loadRuntime(shopDomain: string) {
  const settings = await prisma.designSettings.findUnique({
    where: { shopId_bundleType: { shopId: shopDomain, bundleType: "product_page" } },
    select: { generalSettings: true },
  });
  const generalSettings = settings?.generalSettings && typeof settings.generalSettings === "object"
    ? settings.generalSettings as Record<string, unknown>
    : {};
  const stored = generalSettings.settingsControls;
  if (stored && typeof stored === "object"
    && (stored as Partial<SettingsControlsRuntime>).schemaVersion === SETTINGS_CONTROLS_SCHEMA_VERSION) {
    return stored as SettingsControlsRuntime;
  }
  return buildSettingsControlsRuntime({}).settingsControls;
}

export async function syncStorefrontControlsRuntime(
  admin: Admin,
  shopDomain: string,
  suppliedRuntime?: SettingsControlsRuntime,
) {
  const runtime = suppliedRuntime ?? await loadRuntime(shopDomain);
  assertStorefrontControlsRuntimeSize(runtime);
  const shopId = await resolveShopGid(admin);
  const response = await admin.graphql(`
    mutation SyncStorefrontControlsRuntime($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key }
        userErrors { field message code }
      }
    }
  `, { variables: { metafields: [{
    ownerId: shopId,
    namespace: "$app",
    key: "storefront_controls_runtime",
    type: "json",
    value: JSON.stringify(runtime),
  }] } });
  const data = await response.json();
  const errors = data.data?.metafieldsSet?.userErrors ?? [];
  if (data.errors?.length || errors.length) {
    throw new Error(data.errors?.[0]?.message ?? errors[0]?.message ?? "Unable to sync storefront Controls runtime");
  }
  return runtime;
}
