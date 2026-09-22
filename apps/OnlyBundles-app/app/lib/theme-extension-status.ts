export type ThemeExtensionStatus = "active" | "available" | "unavailable";

export type ShopifyThemeExtensionActivation = {
  handle?: string;
  name?: string;
  target?: string;
  status?: ThemeExtensionStatus;
  activations?: Array<{ target?: string; themeId?: string }>;
};

export type ShopifyThemeExtensionInfo = {
  handle?: string;
  type?: string;
  activations?: ShopifyThemeExtensionActivation[];
};

export const THEME_EXTENSION_RESOURCES = [
  { handle: "bundle-app-embed", label: "Bundle storefront features", kind: "embed" },
  { handle: "bundle-product-page", label: "Product page bundle builder", kind: "block" },
  { handle: "bundle-product-page-embed", label: "Product page bundle placement", kind: "block" },
  { handle: "bundle-page-builder-embed", label: "Page builder bundle placement", kind: "block" },
  { handle: "bundle-upsell", label: "Full page bundle upsell", kind: "block" },
] as const;

export type NormalizedThemeExtensionResource = (typeof THEME_EXTENSION_RESOURCES)[number] & {
  status: ThemeExtensionStatus;
  enabled: boolean;
  target: string | null;
};

export function normalizeThemeExtensionResources(
  extensions: ShopifyThemeExtensionInfo[],
): NormalizedThemeExtensionResource[] {
  const themeExtension = extensions.find((extension) => extension.type === "theme_app_extension");
  const activations = themeExtension?.activations ?? [];

  return THEME_EXTENSION_RESOURCES.map((resource) => {
    const activation = activations.find((candidate) => candidate.handle === resource.handle);
    return {
      ...resource,
      status: activation?.status ?? "unavailable",
      enabled: activation?.status === "active",
      target: activation?.target ?? null,
    };
  });
}

export function hasActiveThemeExtension(
  resources: NormalizedThemeExtensionResource[],
  handle: string,
): boolean {
  return resources.some((resource) => resource.handle === handle && resource.enabled);
}

export function buildThemeAppEmbedEditorUrl(
  shop: string,
  apiKey: string,
  blockHandle: string,
): string {
  const activateAppId = encodeURIComponent(`${apiKey}/${blockHandle}`);
  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${activateAppId}`;
}
