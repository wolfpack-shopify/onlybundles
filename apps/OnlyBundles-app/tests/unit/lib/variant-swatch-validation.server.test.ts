import { validateConfiguredVariantSwatches } from "../../../app/lib/bundle-config/variant-swatch-validation.server";

function graphqlResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
  });
}

function category(overrides: Record<string, unknown> = {}) {
  return {
    id: "category-1",
    variantSelectorMode: "color_swatch",
    products: [{ id: "gid://shopify/Product/1" }],
    collections: [],
    ...overrides,
  };
}

function steps(categoryValue: Record<string, unknown>, stepOverrides: Record<string, unknown> = {}) {
  return [{
    id: "step-1",
    StepCategory: [categoryValue],
    ...stepOverrides,
  }];
}

function product({
  id = "gid://shopify/Product/1",
  values = [
    { name: "Navy", swatch: { color: "#001f3f", image: null } },
    { name: "Red", swatch: { color: "#ff0000", image: null } },
  ],
}: {
  id?: string;
  values?: Array<Record<string, unknown>>;
} = {}) {
  return {
    id,
    options: [{ name: "Color", optionValues: values }],
  };
}

describe("configured Shopify swatch validation", () => {
  it("accepts a product with one complete canonical color-swatch dimension", async () => {
    const admin = {
      graphql: jest.fn().mockResolvedValue(graphqlResponse({ product: product() })),
    } as any;

    await expect(validateConfiguredVariantSwatches(admin, steps(category())))
      .resolves.toEqual([]);
  });

  it("returns an inline category error when any value in the dimension lacks the selected swatch kind", async () => {
    const admin = {
      graphql: jest.fn().mockResolvedValue(graphqlResponse({
        product: product({
          values: [
            { name: "Navy", swatch: { color: "#001f3f", image: null } },
            { name: "Red", swatch: null },
          ],
        }),
      })),
    } as any;

    const issues = await validateConfiguredVariantSwatches(admin, steps(category()));

    expect(issues).toEqual([expect.objectContaining({
      path: "steps.step-1.categories.category-1.variantSelectorMode",
      section: "step_setup",
    })]);
  });

  it("does not require swatches for a default-only product", async () => {
    const admin = {
      graphql: jest.fn().mockResolvedValue(graphqlResponse({
        product: product({ values: [{ name: "Default Title", swatch: null }] }),
      })),
    } as any;

    await expect(validateConfiguredVariantSwatches(admin, steps(category())))
      .resolves.toEqual([]);
  });

  it("skips Shopify queries when variants are displayed as individual products", async () => {
    const admin = { graphql: jest.fn() } as any;

    await expect(validateConfiguredVariantSwatches(
      admin,
      steps(category(), { displayVariantsAsIndividual: true }),
    )).resolves.toEqual([]);
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("validates collection products and follows Shopify pagination for image swatches", async () => {
    const imageValues = [
      { name: "Navy", swatch: { color: null, image: { id: "gid://shopify/MediaImage/1" } } },
      { name: "Red", swatch: { color: null, image: { id: "gid://shopify/MediaImage/2" } } },
    ];
    const admin = {
      graphql: jest.fn()
        .mockResolvedValueOnce(graphqlResponse({
          collection: {
            products: {
              nodes: [product({ id: "gid://shopify/Product/2", values: imageValues })],
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
            },
          },
        }))
        .mockResolvedValueOnce(graphqlResponse({
          collection: {
            products: {
              nodes: [product({ id: "gid://shopify/Product/3", values: imageValues })],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        })),
    } as any;

    await expect(validateConfiguredVariantSwatches(admin, steps(category({
      variantSelectorMode: "image_swatch",
      products: [],
      collections: [{ id: "gid://shopify/Collection/1" }],
    })))).resolves.toEqual([]);
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(admin.graphql.mock.calls[1][1]).toEqual({
      variables: { id: "gid://shopify/Collection/1", after: "cursor-1" },
    });
  });
});
