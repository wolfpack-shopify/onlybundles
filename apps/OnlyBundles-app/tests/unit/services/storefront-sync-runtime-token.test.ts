import { syncBundleStorefrontNow } from "../../../app/services/bundles/storefront-sync.server";
import db from "../../../app/db.server";
import { CartTransformService } from "../../../app/services/cart-transform-service.server";
import { updateBundleProductMetafields } from "../../../app/services/bundles/metafield-sync/operations/bundle-product.server";
import { syncPpbStorefrontRuntime } from "../../../app/services/ppb-storefront-runtime.server";

jest.mock("../../../app/db.server", () => ({
  bundle: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
}));

jest.mock("../../../app/lib/logger", () => ({
  AppLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../../app/shopify.server", () => ({
  unauthenticated: {
    admin: jest.fn().mockResolvedValue({ admin: { graphql: jest.fn() } }),
  },
}));

jest.mock("../../../app/services/cart-transform-service.server", () => ({
  CartTransformService: {
    completeSetup: jest.fn(),
  },
}));

jest.mock("../../../app/services/bundles/metafield-sync/operations/bundle-product.server", () => ({
  updateBundleProductMetafields: jest.fn(),
  updateComponentProductMetafields: jest.fn(),
}));

jest.mock("../../../app/services/theme-colors.server", () => ({
  syncThemeColors: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../app/services/ppb-storefront-runtime.server", () => ({
  syncPpbStorefrontRuntime: jest.fn(),
}));

jest.mock("../../../app/routes/app/app.bundles.full-page-bundle.configure.$bundleId/handlers/shared.server", () => ({
  buildFullPageBundleMetafieldConfig: jest.fn(),
}));

jest.mock("../../../app/routes/app/app.bundles.product-page-bundle.configure.$bundleId/handlers/runtime-config.server", () => ({
  buildSyncBundleConfiguration: jest.fn().mockReturnValue({
    steps: [],
    pricing: null,
  }),
}));

const mockDb = db as any;
const mockCompleteSetup = CartTransformService.completeSetup as jest.Mock;
const mockUpdateBundleProductMetafields = updateBundleProductMetafields as jest.Mock;
const mockSyncPpbStorefrontRuntime = syncPpbStorefrontRuntime as jest.Mock;

describe("storefront sync runtime token contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.bundle.updateMany.mockResolvedValue({ count: 1 });
    mockDb.bundle.findUnique.mockResolvedValue({
      id: "bundle-1",
      shopId: "test-shop.myshopify.com",
      bundleType: "product_page",
      shopifyProductId: "gid://shopify/Product/PARENT",
      shopifyProductHandle: "bundle-handle",
      status: "active",
      name: "Runtime Bundle",
      description: "",
      steps: [],
      pricing: null,
    });
    mockCompleteSetup.mockResolvedValue({
      success: true,
      cartTransformId: "gid://shopify/CartTransform/1",
    });
    mockUpdateBundleProductMetafields.mockResolvedValue(undefined);
    mockSyncPpbStorefrontRuntime.mockResolvedValue(undefined);
  });

  it("does not write component_parents from direct storefront sync", async () => {
    const graphql = jest.fn(async (query: string) => {
      if (query.includes("GetBundleParentProduct")) {
        return {
          json: async () => ({
            data: {
              product: {
                id: "gid://shopify/Product/PARENT",
                handle: "bundle-handle",
                status: "ACTIVE",
                media: { nodes: [{ status: "READY" }] },
                variants: { nodes: [{ id: "gid://shopify/ProductVariant/PARENT" }] },
              },
            },
          }),
        };
      }
      if (query.includes("AddOnlyBundlesParentTags")) {
        return {
          json: async () => ({
            data: { tagsAdd: { node: { id: "gid://shopify/Product/PARENT" }, userErrors: [] } },
          }),
        };
      }
      if (query.includes("ConfigureBundleParentVariant")) {
        return {
          json: async () => ({
            data: { productVariantsBulkUpdate: { productVariants: [], userErrors: [] } },
          }),
        };
      }
      if (query.includes("GetOnlineStorePublication")) {
        return {
          json: async () => ({
            data: {
              publications: {
                nodes: [{ id: "gid://shopify/Publication/1", name: "Online Store" }],
              },
            },
          }),
        };
      }
      if (query.includes("PublishBundleParentProduct")) {
        return {
          json: async () => ({
            data: { publishablePublish: { userErrors: [] } },
          }),
        };
      }
      throw new Error(`Unexpected GraphQL operation: ${query}`);
    });

    await syncBundleStorefrontNow({
      admin: { graphql } as any,
      shopDomain: "test-shop.myshopify.com",
      bundleId: "bundle-1",
      bundleType: "product_page",
      reason: "save",
    });

    expect(mockUpdateBundleProductMetafields).toHaveBeenCalled();
    expect(mockUpdateBundleProductMetafields).toHaveBeenCalledTimes(1);
    expect(mockSyncPpbStorefrontRuntime).toHaveBeenCalledWith(
      expect.any(Object),
      "test-shop.myshopify.com",
    );
  });
});
