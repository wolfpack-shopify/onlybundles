import { prisma } from "../../../app/db.server";
import {
  assertStorefrontControlsRuntimeSize,
  syncStorefrontControlsRuntime,
} from "../../../app/services/storefront-controls-runtime.server";
import { buildSettingsControlsRuntime } from "../../../app/lib/settings-controls-runtime";

jest.mock("../../../app/db.server", () => ({
  prisma: { designSettings: { findUnique: jest.fn() } },
}));

const mockFindUnique = (prisma as any).designSettings.findUnique as jest.Mock;

const response = (data: unknown) => ({ json: async () => data });

describe("storefront Controls runtime metafield", () => {
  beforeEach(() => jest.clearAllMocks());

  it("writes the versioned runtime to the app-owned shop metafield", async () => {
    const runtime = buildSettingsControlsRuntime({}).settingsControls;
    const admin = { graphql: jest.fn()
      .mockResolvedValueOnce(response({ data: { shop: { id: "gid://shopify/Shop/1" } } }))
      .mockResolvedValueOnce(response({ data: { metafieldsSet: { metafields: [{ id: "gid://shopify/Metafield/1" }], userErrors: [] } } })) };

    await syncStorefrontControlsRuntime(admin as any, "shop.test", runtime);

    expect(admin.graphql.mock.calls[1][1].variables.metafields).toEqual([expect.objectContaining({
      ownerId: "gid://shopify/Shop/1",
      namespace: "$app",
      key: "storefront_controls_runtime",
      type: "json",
      value: JSON.stringify(runtime),
    })]);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("rejects an oversized runtime before calling Shopify", async () => {
    const runtime = buildSettingsControlsRuntime({
      "landingPage.scripts.bundlePage": "x".repeat(128 * 1024),
    }).settingsControls;
    const admin = { graphql: jest.fn() };

    expect(() => assertStorefrontControlsRuntimeSize(runtime)).toThrow(/128KB JSON limit/);
    await expect(syncStorefrontControlsRuntime(admin as any, "shop.test", runtime)).rejects.toThrow(/128KB JSON limit/);
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});
