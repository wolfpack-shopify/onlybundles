import { handleUpdateBundleDesignTemplate } from "../../../app/routes/app/app.bundles.full-page-bundle.configure.$bundleId/handlers/page-handlers.server";
import {
  BundleTemplateSnapshotUnavailableError,
  syncBundleTemplateSnapshot,
} from "../../../app/services/bundles/metafield-sync/operations/bundle-template.server";

jest.mock("../../../app/db.server", () => ({
  __esModule: true,
  default: { bundle: { findUnique: jest.fn(), update: jest.fn() } },
}));

jest.mock("../../../app/services/subscriptions/subscription-service.server", () => ({
  resolveShopEntitlements: jest.fn().mockResolvedValue({
    entitlements: { capabilities: { premiumTemplates: true } },
  }),
}));

jest.mock("../../../app/services/bundles/metafield-sync/operations/bundle-template.server", () => {
  const actual = jest.requireActual(
    "../../../app/services/bundles/metafield-sync/operations/bundle-template.server",
  );
  return { ...actual, syncBundleTemplateSnapshot: jest.fn() };
});

const db = require("../../../app/db.server").default;
const mockSync = syncBundleTemplateSnapshot as jest.MockedFunction<
  typeof syncBundleTemplateSnapshot
>;
const admin = { graphql: jest.fn() } as any;
const session = { shop: "test-shop.myshopify.com" } as any;

function form(preset: string) {
  const data = new FormData();
  data.set("bundleDesignTemplate", "FBP_SIDE_FOOTER");
  data.set("bundleDesignPresetId", preset);
  return data;
}

describe("FPB Select Template targeted snapshot sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.bundle.findUnique.mockResolvedValue({
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "CLASSIC",
      shopifyProductId: "gid://shopify/Product/123",
    });
    db.bundle.update.mockResolvedValue({ id: "bundle-1" });
    mockSync.mockResolvedValue({ updated: true });
  });

  it("updates only the template columns and targeted storefront snapshot", async () => {
    const response = await handleUpdateBundleDesignTemplate(
      admin,
      session,
      "bundle-1",
      form("STANDARD"),
    );

    expect(db.bundle.update).toHaveBeenCalledWith({
      where: { id: "bundle-1", shopId: session.shop },
      data: {
        bundleDesignTemplate: "FBP_SIDE_FOOTER",
        bundleDesignPresetId: "STANDARD",
      },
    });
    expect(mockSync).toHaveBeenCalledWith({
      admin,
      bundleProductId: "gid://shopify/Product/123",
      bundleId: "bundle-1",
      bundleType: "full_page",
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "STANDARD",
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns explicit Sync Bundle recovery when the snapshot is unavailable", async () => {
    mockSync.mockRejectedValueOnce(new BundleTemplateSnapshotUnavailableError());

    const response = await handleUpdateBundleDesignTemplate(
      admin,
      session,
      "bundle-1",
      form("COMPACT"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: false,
      syncRequired: true,
      templatePersisted: true,
    }));
  });
});
