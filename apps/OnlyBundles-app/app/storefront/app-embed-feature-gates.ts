type ControlsRuntime = Record<string, any> | undefined;

export function shouldLoadProductFeatures({
  productId = "",
  hasPageBuilderMarker = false,
}: { productId?: string; hasPageBuilderMarker?: boolean }) {
  return Boolean(productId || hasPageBuilderMarker);
}

export function shouldLoadControlsFeatures(runtime: ControlsRuntime) {
  const landing = runtime?.landingPage ?? {};
  const product = runtime?.productPage ?? {};
  return Boolean(
    landing.redirectCollectionQuickAddToBundle
    || product.redirectCollectionQuickAddToBundle
    || landing.css?.themePages
    || landing.css?.bundleDummyProductPage
    || landing.integrations?.customThemeScriptEnabled
    || landing.integrations?.cartIntegrationEnabled,
  );
}

export function shouldLoadCartFeatures({
  pageType = "",
  hasPrivateProperties = false,
}: { pageType?: string; hasPrivateProperties?: boolean }) {
  return pageType === "cart" || hasPrivateProperties;
}
