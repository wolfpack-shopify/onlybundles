import {
  FPB_JSON_LIMIT_BYTES,
  assertFpbStorefrontSnapshotSize,
  buildFpbStorefrontRuntime,
  syncFpbStorefrontRuntime,
} from "../../../app/services/fpb-storefront-runtime.server";
import {
  SETTINGS_LANGUAGE_LOCALES,
  buildSettingsLanguageRuntime,
} from "../../../app/lib/settings-language-runtime";
import { getInitialLanguageFieldValues } from "../../../app/routes/app/app.settings/settings-state";

jest.mock("../../../app/db.server", () => ({
  prisma: {
    designSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  },
}));

function response(data: unknown) {
  return { json: async () => data };
}

describe("FPB Shopify-hosted storefront runtime", () => {
  it("builds a versioned locale runtime without duplicating Controls settings", () => {
    const runtime = buildFpbStorefrontRuntime({
      generalSettings: {
        loadingScreen: {
          gifUrl: "https://cdn.shopify.com/loading.gif",
          backgroundColor: "#123456",
        },
      },
    });

    expect(runtime).toMatchObject({
      schemaVersion: 1,
      loadingScreen: {
        gifUrl: "https://cdn.shopify.com/loading.gif",
        backgroundColor: "#123456",
      },
    });
    expect(runtime.languages.en).toMatchObject({
      bundleType: "full_page",
      activeLocale: "en",
    });
    expect(runtime).not.toHaveProperty("controls");
  });

  it("keeps the complete locale snapshot within Shopify's JSON limit", () => {
    const localeFieldValues = Object.fromEntries(
      SETTINGS_LANGUAGE_LOCALES.map(({ code }) => [
        code,
        getInitialLanguageFieldValues(code),
      ]),
    );
    const settingsLanguage = buildSettingsLanguageRuntime({
      languageMode: "MULTIPLE",
      localeFieldValues,
    }).settingsLanguage;

    const runtime = buildFpbStorefrontRuntime({
      generalSettings: { settingsLanguage },
    });

    expect(Object.keys(runtime.languages)).toHaveLength(39);
    expect(Buffer.byteLength(JSON.stringify(runtime), "utf8"))
      .toBeLessThanOrEqual(FPB_JSON_LIMIT_BYTES);
  });

  it("rejects an oversized JSON snapshot", () => {
    expect(() => assertFpbStorefrontSnapshotSize({ value: "x".repeat(128 * 1024) }))
      .toThrow(/exceeds Shopify's 128KB JSON limit/);
  });

  it("writes the runtime to the app-owned shop metafield", async () => {
    const admin = {
      graphql: jest.fn()
        .mockResolvedValueOnce(response({ data: { shop: { id: "gid://shopify/Shop/1" } } }))
        .mockResolvedValueOnce(response({
          data: { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/1" }], userErrors: [] } },
        })),
    };

    await syncFpbStorefrontRuntime(admin as any, "test.myshopify.com");

    const metafields = admin.graphql.mock.calls[1][1].variables.metafields;
    expect(metafields).toEqual([
      expect.objectContaining({
        ownerId: "gid://shopify/Shop/1",
        namespace: "$app",
        key: "fpb_storefront_runtime",
        type: "json",
      }),
    ]);
  });
});
