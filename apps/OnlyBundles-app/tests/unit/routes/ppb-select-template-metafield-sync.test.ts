import { handleUpdateBundleDesignTemplate } from "../../../app/routes/app/app.bundles.product-page-bundle.configure.$bundleId/handlers/design-template.server";
import {
  BundleTemplateSnapshotConflictError,
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

function form(template: string, preset: string) {
  const data = new FormData();
  data.set("bundleDesignTemplate", template);
  data.set("bundleDesignPresetId", preset);
  return data;
}

describe("PPB Select Template targeted snapshot sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.bundle.findUnique.mockResolvedValue({
      bundleDesignTemplate: "PDP_MODAL",
      bundleDesignPresetId: "VERTICAL_SLOTS",
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
      form("PDP_INPAGE", "LIST"),
    );

    expect(db.bundle.findUnique).toHaveBeenCalledWith({
      where: { id: "bundle-1", shopId: session.shop },
      select: {
        bundleDesignTemplate: true,
        bundleDesignPresetId: true,
        shopifyProductId: true,
      },
    });
    expect(db.bundle.update).toHaveBeenCalledWith({
      where: { id: "bundle-1", shopId: session.shop },
      data: {
        bundleDesignTemplate: "PDP_INPAGE",
        bundleDesignPresetId: "LIST",
      },
    });
    expect(mockSync).toHaveBeenCalledWith({
      admin,
      bundleProductId: "gid://shopify/Product/123",
      bundleId: "bundle-1",
      bundleType: "product_page",
      bundleDesignTemplate: "PDP_INPAGE",
      bundleDesignPresetId: "LIST",
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("skips the database write but verifies the snapshot for an identical request", async () => {
    await handleUpdateBundleDesignTemplate(
      admin,
      session,
      "bundle-1",
      form("PDP_MODAL", "VERTICAL_SLOTS"),
    );

    expect(db.bundle.update).not.toHaveBeenCalled();
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("returns explicit Sync Bundle recovery when the snapshot is unavailable", async () => {
    mockSync.mockRejectedValueOnce(new BundleTemplateSnapshotUnavailableError());

    const response = await handleUpdateBundleDesignTemplate(
      admin,
      session,
      "bundle-1",
      form("PDP_INPAGE", "GRID"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: false,
      syncRequired: true,
      templatePersisted: true,
    }));
  });

  it("returns a retryable conflict without marking the snapshot for full sync", async () => {
    mockSync.mockRejectedValueOnce(new BundleTemplateSnapshotConflictError());

    const response = await handleUpdateBundleDesignTemplate(
      admin,
      session,
      "bundle-1",
      form("PDP_INPAGE", "GRID"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining("changed"),
    }));
  });
});
