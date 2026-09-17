import { BundleType } from "../../../app/constants/bundle";
import { updateBundleProductMetafields } from "../../../app/services/bundles/metafield-sync/operations/bundle-product.server";
import { formatStepCategoryForRuntime } from "../../../app/lib/bundle-config/category-runtime";
import {
  getFirstVariantId,
  batchGetFirstVariantsWithPrices,
} from "../../../app/utils/variant-lookup.server";

jest.mock('../../../app/services/scheduled-bundle-discount.server', () => ({
  syncScheduledBundleDiscounts: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../../app/lib/logger", () => ({
  AppLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    startTimer: jest.fn(() => jest.fn()),
  },
}));

jest.mock("../../../app/utils/variant-lookup.server", () => ({
  getFirstVariantId: jest.fn(),
  batchGetFirstVariantsWithPrices: jest.fn(),
}));

const mockGetFirstVariantId = getFirstVariantId as jest.MockedFunction<typeof getFirstVariantId>;
const mockBatchGetFirstVariantsWithPrices = batchGetFirstVariantsWithPrices as jest.MockedFunction<typeof batchGetFirstVariantsWithPrices>;

function makeAdmin() {
  return {
    graphql: jest.fn().mockImplementation(async (_query: string, options?: any) => ({
      json: async () => ({
        data: {
          productVariantsBulkUpdate: {
            productVariants: options?.variables?.variants ?? [],
            userErrors: [],
          },
          shop: { id: "gid://shopify/Shop/1", policy: null },
          metafieldsSet: {
            metafields: options?.variables?.metafields ?? [],
            userErrors: [],
          },
        },
      }),
    })),
  };
}

function makeBundleConfig(bundleType: BundleType, overrides: Record<string, unknown> = {}) {
  return {
    shopId: "test-shop.myshopify.com",
    id: "bundle-1",
    bundleId: "bundle-1",
    name: "Test Bundle",
    description: "Bundle description",
    status: "active",
    bundleType,
    shopifyProductId: "gid://shopify/Product/999",
    steps: [
      {
        id: "step-1",
        name: "Step 1",
        position: 0,
        minQuantity: 1,
        maxQuantity: 1,
        StepProduct: [{ productId: "gid://shopify/Product/123" }],
        collections: [],
      },
    ],
    pricing: {
      enabled: true,
      method: "percentage_off",
      rules: [
        {
          id: "rule-1",
          conditionType: "quantity",
          conditionValue: 1,
          discountValue: 10,
        },
      ],
      displayOptions: {
        progressBar: { enabled: true, successText: "Unlocked!" },
        bundleQuantityOptions: { enabled: false },
      },
    },
    ...overrides,
  };
}

describe("Metafield Payload Slimming (Step 8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFirstVariantId.mockResolvedValue({
      success: true,
      variantId: "gid://shopify/ProductVariant/1230",
      priceCents: 1000,
      title: "Default Title",
    });
    mockBatchGetFirstVariantsWithPrices.mockResolvedValue(new Map());
  });

  describe("Category Product Runtime Reference", () => {
    it("omits descriptionHtml from category products while retaining plain description", () => {
      const hydratedProduct = {
        id: "gid://shopify/Product/111",
        productId: "111",
        graphqlId: "gid://shopify/Product/111",
        handle: "rings",
        title: "Rings",
        imageUrl: "https://cdn.example/ring-card.jpg",
        description: "Detailed ring description",
        descriptionHtml: "<p>Detailed ring description with <strong>heavy HTML markup</strong></p>",
        price: "10.00",
        variants: [
          {
            id: "gid://shopify/ProductVariant/222",
            title: "Size 6",
            price: "10.00",
            availableForSale: true,
          },
        ],
      };

      const runtime = formatStepCategoryForRuntime({
        id: "category-1",
        name: "Rings",
        products: [hydratedProduct],
      }, 0);

      expect(runtime.products[0]).toBeDefined();
      expect(runtime.products[0].description).toBe("Detailed ring description");
      expect((runtime.products[0] as any).descriptionHtml).toBeUndefined();
    });
  });

  describe("Bundle UI Config Deduplication & Compaction", () => {
    it("omits duplicate displayOptions from messaging while keeping pricing.displayOptions", async () => {
      const admin = makeAdmin();
      const bundleConfig = makeBundleConfig(BundleType.PRODUCT_PAGE);

      const result = await updateBundleProductMetafields(
        admin as any,
        "gid://shopify/Product/999",
        bundleConfig as any,
        "gid://shopify/ProductVariant/9991",
      );

      const uiConfigField = result.find((f: any) => f.key === "bundle_ui_config");
      expect(uiConfigField).toBeDefined();
      const uiConfig = JSON.parse(uiConfigField.value);

      expect(uiConfig.pricing.displayOptions).toEqual(bundleConfig.pricing.displayOptions);
      expect(uiConfig.messaging.displayOptions).toBeUndefined();
    });

    it("compacts disabled bundleUpsellConfig to null", async () => {
      const admin = makeAdmin();
      const bundleConfig = makeBundleConfig(BundleType.PRODUCT_PAGE, {
        bundleUpsellConfig: {
          multiLangText: {},
          upsellConfiguration: {
            isEnabled: false,
            title: "Upsell",
            displayConfiguration: { selectedProducts: [] },
          },
          widgetConfiguration: {
            isEnabled: false,
            title: "Widget",
            displayConfiguration: { selectedProducts: [] },
          },
        },
      });

      const result = await updateBundleProductMetafields(
        admin as any,
        "gid://shopify/Product/999",
        bundleConfig as any,
        "gid://shopify/ProductVariant/9991",
      );

      const uiConfigField = result.find((f: any) => f.key === "bundle_ui_config");
      const uiConfig = JSON.parse(uiConfigField.value);
      expect(uiConfig.bundleUpsellConfig).toBeNull();
    });

    it("preserves active bundleUpsellConfig when upsell or widget is enabled", async () => {
      const admin = makeAdmin();
      const activeUpsell = {
        multiLangText: {},
        upsellConfiguration: {
          isEnabled: true,
          title: "Build & Save",
          displayConfiguration: { selectedProducts: [] },
        },
        widgetConfiguration: {
          isEnabled: false,
          title: "Widget",
          displayConfiguration: { selectedProducts: [] },
        },
      };
      const bundleConfig = makeBundleConfig(BundleType.PRODUCT_PAGE, {
        bundleUpsellConfig: activeUpsell,
      });

      const result = await updateBundleProductMetafields(
        admin as any,
        "gid://shopify/Product/999",
        bundleConfig as any,
        "gid://shopify/ProductVariant/9991",
      );

      const uiConfigField = result.find((f: any) => f.key === "bundle_ui_config");
      const uiConfig = JSON.parse(uiConfigField.value);
      expect(uiConfig.bundleUpsellConfig).toEqual(activeUpsell);
    });
  });

  describe("Shopify Size Limits Enforcement", () => {
    it("enforces 64KB limit on product-page bundle_ui_config", async () => {
      const admin = makeAdmin();
      // Generate a massive text override to inflate bundle_ui_config beyond 64KB
      const massiveText = "X".repeat(65 * 1024);
      const bundleConfig = makeBundleConfig(BundleType.PRODUCT_PAGE, {
        description: massiveText,
      });

      await expect(
        updateBundleProductMetafields(
          admin as any,
          "gid://shopify/Product/999",
          bundleConfig as any,
          "gid://shopify/ProductVariant/9991",
        ),
      ).rejects.toThrow(/bundle_ui_config metafield exceeds Shopify's 64KB limit/);
    });

    it("enforces 10,000 bytes limit on price_adjustment", async () => {
      const admin = makeAdmin();
      const hugeRules = Array.from({ length: 130 }, (_, i) => ({
        id: `rule-${i}`,
        conditionType: "quantity",
        conditionValue: i + 1,
        discountValue: 10,
      }));
      const bundleConfig = makeBundleConfig(BundleType.PRODUCT_PAGE, {
        pricing: {
          enabled: true,
          method: "percentage_off",
          rules: hugeRules,
        },
      });

      await expect(
        updateBundleProductMetafields(
          admin as any,
          "gid://shopify/Product/999",
          bundleConfig as any,
          "gid://shopify/ProductVariant/9991",
        ),
      ).rejects.toThrow(/price_adjustment exceeds the Shopify Function metafield limit of 10000 bytes/);
    });
  });
});
