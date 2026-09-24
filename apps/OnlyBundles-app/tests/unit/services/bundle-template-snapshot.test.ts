import {
  BundleTemplateSnapshotConflictError,
  BundleTemplateSnapshotUnavailableError,
  syncBundleTemplateSnapshot,
} from "../../../app/services/bundles/metafield-sync/operations/bundle-template.server";

jest.mock("../../../app/lib/logger", () => ({
  AppLogger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const baseSnapshot = {
  schemaVersion: 4,
  id: "bundle-1",
  bundleType: "product_page",
  bundleDesignTemplate: "PDP_INPAGE",
  bundleDesignPresetId: "LIST",
  steps: [{ id: "step-1" }],
  unrelated: { retained: true },
};

function queryPayload(value: unknown = baseSnapshot) {
  return {
    data: {
      product: {
        variants: {
          nodes: [{
            id: "gid://shopify/ProductVariant/1",
            bundleConfig: {
              type: "json",
              value: typeof value === "string" ? value : JSON.stringify(value),
              compareDigest: "digest-1",
            },
          }],
        },
      },
    },
  };
}

function input(admin: any) {
  return {
    admin,
    bundleProductId: "gid://shopify/Product/1",
    bundleId: "bundle-1",
    bundleType: "product_page" as const,
    bundleDesignTemplate: "PDP_INPAGE",
    bundleDesignPresetId: "GRID",
  };
}

describe("syncBundleTemplateSnapshot", () => {
  it("updates only bundle_ui_config with compare-and-set while retaining unrelated snapshot data", async () => {
    const graphql = jest.fn()
      .mockResolvedValueOnce({ json: async () => queryPayload() })
      .mockImplementationOnce(async (_query: string, options: any) => ({
        json: async () => ({
          data: {
            metafieldsSet: {
              metafields: [{
                key: "bundle_ui_config",
                value: options.variables.metafields[0].value,
              }],
              userErrors: [],
            },
          },
        }),
      }));

    await expect(syncBundleTemplateSnapshot(input({ graphql } as any)))
      .resolves.toEqual({ updated: true });

    expect(graphql).toHaveBeenCalledTimes(2);
    const mutationVariables = graphql.mock.calls[1][1].variables;
    expect(mutationVariables.metafields).toHaveLength(1);
    expect(mutationVariables.metafields[0]).toEqual(expect.objectContaining({
      ownerId: "gid://shopify/ProductVariant/1",
      namespace: "$app",
      key: "bundle_ui_config",
      type: "json",
      compareDigest: "digest-1",
    }));
    expect(JSON.parse(mutationVariables.metafields[0].value)).toEqual({
      ...baseSnapshot,
      bundleDesignPresetId: "GRID",
    });
  });

  it("does not write when the snapshot already has the selected template", async () => {
    const graphql = jest.fn().mockResolvedValue({
      json: async () => queryPayload({
        ...baseSnapshot,
        bundleDesignPresetId: "GRID",
      }),
    });

    await expect(syncBundleTemplateSnapshot(input({ graphql } as any)))
      .resolves.toEqual({ updated: false });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["malformed JSON", "{"],
    ["wrong bundle id", { ...baseSnapshot, id: "bundle-2" }],
    ["wrong schema", { ...baseSnapshot, schemaVersion: 3 }],
    ["missing steps", { ...baseSnapshot, steps: undefined }],
  ])("classifies %s as an unavailable storefront snapshot", async (_label, value) => {
    const graphql = jest.fn().mockResolvedValue({
      json: async () => queryPayload(value),
    });

    await expect(syncBundleTemplateSnapshot(input({ graphql } as any)))
      .rejects.toBeInstanceOf(BundleTemplateSnapshotUnavailableError);
  });

  it("surfaces Shopify compare-and-set conflicts without retrying or overwriting", async () => {
    const graphql = jest.fn()
      .mockResolvedValueOnce({ json: async () => queryPayload() })
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            metafieldsSet: {
              metafields: [],
              userErrors: [{ code: "STALE_OBJECT", message: "stale" }],
            },
          },
        }),
      });

    await expect(syncBundleTemplateSnapshot(input({ graphql } as any)))
      .rejects.toBeInstanceOf(BundleTemplateSnapshotConflictError);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("rejects a mutation response that does not confirm the requested value", async () => {
    const graphql = jest.fn()
      .mockResolvedValueOnce({ json: async () => queryPayload() })
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            metafieldsSet: {
              metafields: [{
                key: "bundle_ui_config",
                value: JSON.stringify(baseSnapshot),
              }],
              userErrors: [],
            },
          },
        }),
      });

    await expect(syncBundleTemplateSnapshot(input({ graphql } as any)))
      .rejects.toThrow("did not confirm");
  });
});
