import { ProductPageConfigLifecycleMethods } from "../../../app/assets/widgets/product-page/methods/config-lifecycle-methods";
import { buildProductPageCartFormData } from "../../../app/assets/widgets/shared/engine/cart-submit";

function lifecycleContext(bundleConfig?: unknown) {
  const context: any = {
    container: {
      dataset: {
        bundleType: "product_page",
        bundleId: "bundle-1",
        ...(bundleConfig === undefined ? {} : { bundleConfig: JSON.stringify(bundleConfig) }),
      },
      style: {},
    },
    showThemeEditorPreview: jest.fn(),
  };
  context._parseBundleConfigPayload = ProductPageConfigLifecycleMethods._parseBundleConfigPayload;
  context._isShopifyHostedPpbSnapshot = ProductPageConfigLifecycleMethods._isShopifyHostedPpbSnapshot;
  return context;
}

describe("Product Page Shopify-hosted initialization", () => {
  it("hydrates a complete schema-v4 snapshot without a network request", async () => {
    const snapshot = {
      schemaVersion: 4,
      id: "bundle-1",
      bundleType: "product_page",
      steps: [{ id: "step-1", products: [] }],
      runtimePolicyRevision: "published",
    };
    const context = lifecycleContext(snapshot);
    const fetchSpy = jest.spyOn(global, "fetch");

    await ProductPageConfigLifecycleMethods.loadBundleData.call(context);

    expect(context.bundleData).toEqual({ "bundle-1": snapshot });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not hydrate or fetch when only the retired proxy marker is available", async () => {
    const context = lifecycleContext({ v: 2, type: "product_page", id: "bundle-1" });
    const fetchSpy = jest.spyOn(global, "fetch");

    await ProductPageConfigLifecycleMethods.loadBundleData.call(context);

    expect(context.bundleData).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns cleanly on a product with no bundle snapshot", async () => {
    const context = lifecycleContext();

    await ProductPageConfigLifecycleMethods.loadBundleData.call(context);

    expect(context.bundleData).toBeUndefined();
  });
});

describe("Product Page multipart cart payload", () => {
  it("preserves published policy selection and stable bundle identifiers", () => {
    const context = buildProductPageCartFormData([{
      id: "11",
      quantity: 2,
      properties: {
        _wpb_selection: "selection",
        _bundle_display_properties: JSON.stringify({ Box: "1" }),
      },
    }], {
      bundleName: "Bundle",
      offerId: "MIX-bundle-1",
      sessionKey: "SESSION",
    });

    expect(context).not.toHaveProperty("bundleDetailsKey");
    const { formData } = context;
    expect(formData.get("items[0][properties][_wpb_selection]")).toBe("selection");
    expect(formData.get("items[0][properties][_wolfpack_bundle_runtime]")).toBeNull();
    expect(formData.get("items[0][properties][_wolfpackProductBundle:OfferId]")).toBe("MIX-bundle-1_SESSION_1");
  });
});
