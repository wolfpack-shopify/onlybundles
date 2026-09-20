import { ensureVariantBundleMetafieldDefinitions } from "../../../app/services/bundles/metafield-sync/operations/definitions.server";

jest.mock("../../../app/lib/logger", () => ({
  AppLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

describe("ensureVariantBundleMetafieldDefinitions", () => {
  it("creates only the current variant-level bundle definitions", async () => {
    const admin = {
      graphql: jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          data: {
            metafieldDefinitionCreate: {
              createdDefinition: { id: "definition-1" },
              userErrors: [],
            },
          },
        }),
      }),
    };

    await ensureVariantBundleMetafieldDefinitions(admin);

    const keys = admin.graphql.mock.calls.map(([, options]: any) =>
      options.variables.definition.key,
    );
    const policies = admin.graphql.mock.calls.map(([, options]: any) => options.variables.definition).filter((definition: any) => ["ppb_policy_revisions", "bundle_parent_policy"].includes(definition.key));
    expect(policies).toHaveLength(2);
    for (const definition of policies) expect(definition.access.admin).toBe("MERCHANT_READ");
    expect(keys).toEqual([
      "component_reference",
      "component_quantities",
      "price_adjustment",
      "bundle_ui_config",
      "component_pricing",
      "ppb_policy_revisions",
      "bundle_parent_policy",
    ]);
  });
});


test("updates existing policy definitions to remove merchant write permission", async () => {
  const admin = { graphql: jest.fn(async (query: string, options: any) => ({ json: async () => ({ data: query.includes("metafieldDefinitionUpdate")
    ? {metafieldDefinitionUpdate: { updatedDefinition: { id: "definition", access: options.variables.definition.access }, userErrors: [] }}
    : {metafieldDefinitionCreate: {userErrors: [{code: "TAKEN"}]}} }) })) };
  expect(await ensureVariantBundleMetafieldDefinitions(admin)).toBe(true);
  const updates = admin.graphql.mock.calls.filter(([query]) => query.includes("metafieldDefinitionUpdate"));
  expect(updates).toHaveLength(2);
  for (const [, options] of updates) expect(options.variables.definition.access.admin).toBe("MERCHANT_READ");
});

test("fails definition provisioning when Shopify rejects a required definition", async () => {
  const admin = { graphql: jest.fn(async () => ({ json: async () => ({errors: [{message: "Denied"}]}) })) };
  expect(await ensureVariantBundleMetafieldDefinitions(admin)).toBe(false);
});
