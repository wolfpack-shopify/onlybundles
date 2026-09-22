import {
  shouldLoadCartFeatures,
  shouldLoadControlsFeatures,
  shouldLoadProductFeatures,
} from "../../../app/storefront/app-embed-feature-gates";

describe("app embed feature gates", () => {
  it("loads product features only for product or explicit page-builder contexts", () => {
    expect(shouldLoadProductFeatures({ productId: "1" })).toBe(true);
    expect(shouldLoadProductFeatures({ hasPageBuilderMarker: true })).toBe(true);
    expect(shouldLoadProductFeatures({})).toBe(false);
  });

  it("loads controls only when a runtime behavior is enabled", () => {
    expect(shouldLoadControlsFeatures({ landingPage: { css: { themePages: "body{}" } } })).toBe(true);
    expect(shouldLoadControlsFeatures({ productPage: { redirectCollectionQuickAddToBundle: true } })).toBe(true);
    expect(shouldLoadControlsFeatures({ landingPage: {}, productPage: {} })).toBe(false);
  });

  it("loads cart features on cart surfaces or when private properties are present", () => {
    expect(shouldLoadCartFeatures({ pageType: "cart" })).toBe(true);
    expect(shouldLoadCartFeatures({ hasPrivateProperties: true })).toBe(true);
    expect(shouldLoadCartFeatures({ pageType: "product" })).toBe(false);
  });

  it("does not use product identity alone to load unrelated controls or cart features", () => {
    expect(shouldLoadControlsFeatures({ landingPage: {}, productPage: { showCompareAtPrices: true } })).toBe(false);
    expect(shouldLoadCartFeatures({ pageType: "product", hasPrivateProperties: false })).toBe(false);
  });
});
