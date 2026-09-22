import { storefrontPath } from "../../../app/assets/widgets/shared/storefront-path";

describe("locale-aware storefront paths", () => {
  it("prefixes relative paths with Shopify.routes.root", () => {
    expect(storefrontPath("cart", { Shopify: { routes: { root: "/fr/" } } } as any)).toBe("/fr/cart");
    expect(storefrontPath("/checkout", { Shopify: { routes: { root: "/" } } } as any)).toBe("/checkout");
  });

  it("preserves absolute URLs", () => {
    expect(storefrontPath("https://example.test/cart", {} as any)).toBe("https://example.test/cart");
  });
});
