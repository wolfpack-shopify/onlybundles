import fs from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";
import { ensureVariantBundleMetafieldDefinitions } from "../../../app/services/bundles/metafield-sync/operations/definitions.server";

describe.each([
  "shopify.app.toml",
  "shopify.app.wolfpack-product-bundles-sit.toml",
])("declarative metafield definitions in %s", (filename) => {
  it("declares the Shopify-hosted bundle contracts", () => {
    const config = parse(fs.readFileSync(path.resolve(process.cwd(), filename), "utf8")) as any;

    expect(config.shop.metafields.app.fpb_storefront_runtime).toMatchObject({
      type: "json",
      access: { admin: "merchant_read_write", storefront: "public_read" },
    });
    expect(config.shop.metafields.app.ppb_policy_revisions.access.admin).toBe("merchant_read");
  });
});

describe("variant metafield definition gap", () => {
  it("ensures only the variant-owned contracts rejected by app config validation", async () => {
    const admin = { graphql: jest.fn().mockResolvedValue({
      json: async () => ({ data: { metafieldDefinitionCreate: { userErrors: [] } } }),
    }) };

    await expect(ensureVariantBundleMetafieldDefinitions(admin)).resolves.toBe(true);
    expect(admin.graphql.mock.calls.map(([, options]) => options.variables.definition.key))
      .toEqual([
        "component_reference",
        "component_quantities",
        "price_adjustment",
        "bundle_ui_config",
        "component_pricing",
        "bundle_parent_policy",
      ]);
    expect(admin.graphql.mock.calls.every(([, options]) => (
      options.variables.definition.ownerType === "PRODUCTVARIANT"
    ))).toBe(true);
  });

  it("repairs merchant access for an existing bundle parent policy definition", async () => {
    const admin = {
      graphql: jest.fn()
        .mockResolvedValueOnce({
          json: async () => ({ data: { metafieldDefinitionCreate: { userErrors: [] } } }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ data: { metafieldDefinitionCreate: { userErrors: [] } } }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ data: { metafieldDefinitionCreate: { userErrors: [] } } }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ data: { metafieldDefinitionCreate: { userErrors: [] } } }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ data: { metafieldDefinitionCreate: { userErrors: [] } } }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            data: {
              metafieldDefinitionCreate: {
                userErrors: [{ code: "TAKEN", field: ["definition"], message: "Taken" }],
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            data: {
              metafieldDefinitionUpdate: {
                updatedDefinition: {
                  access: { admin: "MERCHANT_READ", storefront: "NONE" },
                },
                userErrors: [],
              },
            },
          }),
        }),
    };

    await expect(ensureVariantBundleMetafieldDefinitions(admin)).resolves.toBe(true);
    expect(admin.graphql).toHaveBeenLastCalledWith(
      expect.stringContaining("metafieldDefinitionUpdate"),
      expect.objectContaining({
        variables: {
          definition: {
            namespace: "$app",
            key: "bundle_parent_policy",
            ownerType: "PRODUCTVARIANT",
            access: { admin: "MERCHANT_READ", storefront: "NONE" },
          },
        },
      }),
    );
  });
});
