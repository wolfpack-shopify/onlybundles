import { handleUpdateBundleDesignTemplate } from "../../../app/routes/app/app.bundles.full-page-bundle.configure.$bundleId/handlers/page-handlers.server";
import { syncBundleStorefrontNow } from "../../../app/services/bundles/storefront-sync.server";

jest.mock("../../../app/db.server", () => ({
  __esModule: true,
  default: { bundle: { update: jest.fn() } },
}));

jest.mock("../../../app/services/subscriptions/subscription-service.server", () => ({
  resolveShopEntitlements: jest.fn().mockResolvedValue({ entitlements: {} }),
}));

jest.mock("../../../app/services/subscriptions/bundle-entitlement-gate.server", () => ({
  assertTemplateSelectionAllowed: jest.fn(),
}));

jest.mock("../../../app/services/bundles/storefront-sync.server", () => ({
  syncBundleStorefrontNow: jest.fn(),
}));

const getDb = () => require("../../../app/db.server").default;
const mockSync = syncBundleStorefrontNow as jest.MockedFunction<typeof syncBundleStorefrontNow>;
const admin = { graphql: jest.fn() } as any;
const session = { shop: "test-shop.myshopify.com" } as any;

function standardTemplateForm() {
  const formData = new FormData();
  formData.set("bundleDesignTemplate", "FBP_SIDE_FOOTER");
  formData.set("bundleDesignPresetId", "STANDARD");
  return formData;
}

describe("FPB Select Template Shopify snapshot sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDb().bundle.update.mockResolvedValue({ id: "bundle-1" });
    mockSync.mockResolvedValue({ skipped: false, synced: true } as any);
  });

  it("synchronizes the saved template through the shared storefront owner", async () => {
    const response = await handleUpdateBundleDesignTemplate(
      admin,
      session,
      "bundle-1",
      standardTemplateForm(),
    );

    expect(getDb().bundle.update).toHaveBeenCalledWith({
      where: { id: "bundle-1", shopId: "test-shop.myshopify.com" },
      data: {
        bundleDesignTemplate: "FBP_SIDE_FOOTER",
        bundleDesignPresetId: "STANDARD",
      },
    });
    expect(mockSync).toHaveBeenCalledWith({
      admin,
      shopDomain: "test-shop.myshopify.com",
      bundleId: "bundle-1",
      bundleType: "full_page",
      reason: "save",
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("does not report success when Shopify snapshot synchronization fails", async () => {
    mockSync.mockRejectedValueOnce(new Error("Shopify metafield sync failed"));

    await expect(handleUpdateBundleDesignTemplate(
      admin,
      session,
      "bundle-1",
      standardTemplateForm(),
    )).rejects.toThrow("Shopify metafield sync failed");
  });
});
