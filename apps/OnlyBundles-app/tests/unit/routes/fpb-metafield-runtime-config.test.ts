import { buildFullPageBundleMetafieldConfig } from "../../../app/routes/app/app.bundles.full-page-bundle.configure.$bundleId/handlers/shared.server";
import { compileBundleRuntimePolicy } from "../../../app/services/bundle-runtime-policy.server";

describe("FPB runtime metafield config", () => {
  it("publishes required default products through the FPB sync configuration", () => {
    const config = buildFullPageBundleMetafieldConfig({
      id: "bundle-defaults", name: "Bundle", status: "active", bundleType: "full_page",
      steps: [{id: "step", StepProduct: [{productId: "gid://shopify/Product/1", variants: []}]}],
      defaultProductsData: {isDefaultProductsEnabled: true, products: [{
        productId: "2", graphqlId: "gid://shopify/Product/2", requiredQuantity: 2,
        variants: [{variantGraphqlId: "gid://shopify/ProductVariant/22"}],
      }]},
    });
    const compiled = compileBundleRuntimePolicy({bundle: config, parentVariantId: "gid://shopify/ProductVariant/999"});
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(compiled.error);
    expect(compiled.productPolicies.map(p => p.productId)).toContain("gid://shopify/Product/2");
    for (const projection of compiled.productPolicies) {
      expect(projection.metafield.policies[0].groups).toContainEqual(expect.objectContaining({
        id: "default-products", role: "default", minQuantity: 2, maxQuantity: 2,
        requiredProducts: [{productId: "gid://shopify/Product/2", quantity: 2}],
      }));
    }
  });
  const product = {
    productId: "gid://shopify/Product/123",
    title: "Runtime Product",
    imageUrl: "https://cdn.shopify.com/product.jpg",
    price: 1999,
    compareAtPrice: 2499,
    variants: [
      {
        id: "gid://shopify/ProductVariant/111",
        title: "Small",
        price: 1999,
        compareAtPrice: 2499,
        available: true,
      },
      {
        id: "gid://shopify/ProductVariant/222",
        title: "Large",
        price: 2199,
        available: true,
      },
    ],
  };

  it("preserves the canonical Full Page type", () => {
    const config = buildFullPageBundleMetafieldConfig({
      id: "bundle-1",
      name: "Bundle",
      status: "active",
      bundleType: "full_page",
      publicNumber: 1,
      steps: [],
    });

    expect(config.id).toBe("bundle-1");
    expect(config).not.toHaveProperty("bundleId");
    expect(config).not.toHaveProperty("updatedAt");
    expect(config.bundleType).toBe("full_page");
  });

  it("publishes the explicit FPB template identity used to scope storefront CSS", () => {
    const config = buildFullPageBundleMetafieldConfig({
      id: "bundle-1",
      name: "Bundle",
      status: "active",
      bundleType: "full_page",
      bundleDesignTemplate: "FBP_SIDE_FOOTER",
      bundleDesignPresetId: "STANDARD",
      steps: [],
    });

    expect(config.bundleDesignTemplate).toBe("FBP_SIDE_FOOTER");
    expect(config.bundleDesignPresetId).toBe("STANDARD");
  });

  it.each([undefined, "product_page"])(
    "rejects non-FPB bundle type %s",
    (bundleType) => {
      expect(() =>
        buildFullPageBundleMetafieldConfig({
          id: "bundle-1",
          name: "Bundle",
          status: "active",
          bundleType,
          publicNumber: 1,
          steps: [],
        })
      ).toThrow("FPB metafield config requires bundleType full_page");
    }
  );

  it("preserves enriched products in the full-page metafield config", () => {
    const config = buildFullPageBundleMetafieldConfig({
      id: "bundle-1",
      name: "Bundle",
      description: "",
      status: "active",
      bundleType: "full_page",
      fullPageLayout: null,
      templateName: null,
      shopifyProductId: "gid://shopify/Product/999",
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          StepProduct: [product],
          StepCategory: [
            {
              id: "cat-1",
              title: "Category 1",
              products: [{ id: "gid://shopify/Product/123" }],
            },
          ],
        },
      ],
      pricing: null,
    } as any) as any;

    expect(config.steps[0].StepProduct).toEqual([product]);
    expect(config.steps[0].StepCategory[0].products).toEqual([{id: "gid://shopify/Product/123"}]);
    expect(config.steps[0].categories[0].products[0]).toMatchObject({
      selectionId: "gid://shopify/Product/123",
      price: 1999,
      variants: expect.arrayContaining([
        expect.objectContaining({
          selectionId: "gid://shopify/ProductVariant/111",
          price: 1999,
        }),
      ]),
    });
  });

  it("serializes fixed bundle price through canonical discountValue only", () => {
    const config = buildFullPageBundleMetafieldConfig({
      id: "bundle-1",
      name: "Bundle",
      description: "",
      status: "active",
      bundleType: "full_page",
      fullPageLayout: null,
      templateName: null,
      shopifyProductId: "gid://shopify/Product/999",
      steps: [
        {
          id: "step-1",
          name: "Step 1",
          StepProduct: [product],
        },
      ],
      pricing: {
        enabled: true,
        method: "fixed_bundle_price",
        rules: [
          {
            id: "rule-1",
            conditionType: "quantity",
            conditionOperator: "lt",
            conditionValue: 2,
            discountValue: 4999,
            fixedBundlePrice: 9999,
          },
        ],
        messages: {},
      },
    } as any) as any;

    expect(config.pricing.rules[0]).toMatchObject({
      conditionOperator: "lt",
      discountValue: 4999,
    });
    expect(config.pricing.rules[0]).not.toHaveProperty("fixedBundlePrice");
    expect(config).not.toHaveProperty("fullPageLayout");
  });
});


test('passes the saved per-product ceiling to the runtime policy compiler', () => {
  const config = buildFullPageBundleMetafieldConfig({id:'bundle',bundleType:'full_page',validateQuantityPerProduct:{isEnabled:true,allowedQuantity:2}});
  expect(config.validateQuantityPerProduct).toEqual({isEnabled:true,allowedQuantity:2});
});
