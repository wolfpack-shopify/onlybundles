import { BundleType } from "../constants/bundle";
import { prisma } from "../db.server";
import { resolveBundleLoadingScreenSettings } from "../lib/bundle-loading-screen";
import { buildSettingsLanguageResponse } from "../lib/settings-language-runtime";

export const FPB_JSON_LIMIT_BYTES = 128 * 1024;

type Admin = {
  graphql: any;
};

function languageLocales(settingsLanguage: unknown) {
  if (!settingsLanguage || typeof settingsLanguage !== "object") return ["en"];
  const locales = Object.keys(settingsLanguage as Record<string, unknown>)
    .filter((locale) => !["languageMode", "mixAndMatchTextData", "sharedComponents"].includes(locale));
  return [...new Set(["en", ...locales])];
}

function buildFpbLanguageSnapshot(settingsLanguage: unknown, locale: string) {
  const response = buildSettingsLanguageResponse(
    settingsLanguage,
    BundleType.FULL_PAGE,
    locale,
  );
  return {
    bundleType: response.bundleType,
    languageMode: response.languageMode,
    activeLocale: response.activeLocale,
    sharedCartLabels: response.sharedCartLabels,
    textOverrides: response.textOverrides,
  };
}

export function buildFpbStorefrontRuntime(input: {
  generalSettings: Record<string, unknown>;
}) {
  const settingsLanguage = input.generalSettings.settingsLanguage;
  const languages = Object.fromEntries(
    languageLocales(settingsLanguage).map((locale) => [
      locale,
      buildFpbLanguageSnapshot(settingsLanguage, locale),
    ]),
  );

  return {
    schemaVersion: 1,
    loadingScreen: resolveBundleLoadingScreenSettings(input.generalSettings),
    languages,
  };
}

export function assertFpbStorefrontSnapshotSize(value: unknown) {
  const size = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (size > FPB_JSON_LIMIT_BYTES) {
    throw new Error(
      `fpb_storefront_runtime exceeds Shopify's 128KB JSON limit (${size} bytes)`,
    );
  }
  return size;
}

async function resolveShopGid(admin: Admin) {
  const response = await admin.graphql(`query FpbRuntimeShop { shop { id } }`);
  const data = await response.json();
  const id = data.data?.shop?.id;
  if (typeof id !== "string" || !id) {
    throw new Error("Unable to resolve Shopify Shop ID for FPB runtime sync");
  }
  return id;
}

export async function syncFpbStorefrontRuntime(
  admin: Admin,
  shopDomain: string,
) {
  const [shopId, settings] = await Promise.all([
    resolveShopGid(admin),
    prisma.designSettings.findUnique({
      where: {
        shopId_bundleType: {
          shopId: shopDomain,
          bundleType: BundleType.FULL_PAGE,
        },
      },
    }),
  ]);
  const generalSettings = settings?.generalSettings
    && typeof settings.generalSettings === "object"
    ? settings.generalSettings as Record<string, unknown>
    : {};
  const runtime = buildFpbStorefrontRuntime({ generalSettings });
  assertFpbStorefrontSnapshotSize(runtime);

  const response = await admin.graphql(`
    mutation SyncFpbStorefrontRuntime($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key }
        userErrors { field message code }
      }
    }
  `, {
    variables: {
      metafields: [{
        ownerId: shopId,
        namespace: "$app",
        key: "fpb_storefront_runtime",
        type: "json",
        value: JSON.stringify(runtime),
      }],
    },
  });
  const data = await response.json();
  const errors = data.data?.metafieldsSet?.userErrors ?? [];
  if (data.errors?.length || errors.length) {
    throw new Error(
      `Unable to sync FPB storefront runtime: ${data.errors?.[0]?.message ?? errors[0]?.message}`,
    );
  }
  return runtime;
}
