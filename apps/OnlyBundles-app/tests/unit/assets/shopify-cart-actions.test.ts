import {
  openShopifyCart,
  updateShopifyCart,
} from "../../../app/assets/widgets/shared/shopify-cart-actions";

describe("Shopify storefront cart actions", () => {
  it("maps existing cart lines to Shopify action inputs", async () => {
    const updateCart = jest.fn().mockResolvedValue({ cart: { id: "cart-1" }, userErrors: [], warnings: [] });
    const runtimeWindow = { Shopify: { actions: { updateCart } } } as any;

    await updateShopifyCart([{
      id: 123,
      quantity: 2,
      properties: { _bundle_id: "bundle-1", Label: "Bundle" },
      selling_plan: "gid://shopify/SellingPlan/9",
    }], runtimeWindow);

    expect(updateCart).toHaveBeenCalledWith({ lines: [{
      merchandiseId: "gid://shopify/ProductVariant/123",
      quantity: 2,
      attributes: [
        { key: "_bundle_id", value: "bundle-1" },
        { key: "Label", value: "Bundle" },
      ],
      sellingPlanId: "gid://shopify/SellingPlan/9",
    }] }, {
      event: { context: "product", detail: { source: "only-bundles" } },
    });
  });

  it("surfaces native user errors and does not fall back to Ajax cart endpoints", async () => {
    const updateCart = jest.fn().mockResolvedValue({
      cart: null,
      userErrors: [{ message: "Sold out" }],
      warnings: [],
    });

    await expect(updateShopifyCart([{ id: 123, quantity: 1 }], {
      Shopify: { actions: { updateCart } },
    } as any)).rejects.toThrow("Sold out");
  });

  it("delegates cart presentation to Shopify", async () => {
    const openCart = jest.fn().mockResolvedValue(undefined);
    await openShopifyCart({ Shopify: { actions: { openCart } } } as any);
    expect(openCart).toHaveBeenCalledTimes(1);
  });
});
