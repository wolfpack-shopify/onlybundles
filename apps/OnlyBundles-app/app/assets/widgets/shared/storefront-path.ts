type StorefrontWindow = Window & {
  Shopify?: { routes?: { root?: string } };
};

export function storefrontPath(
  path: string,
  runtimeWindow: StorefrontWindow | undefined = (globalThis as { window?: StorefrontWindow }).window,
) {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) return path;
  const root = String(runtimeWindow?.Shopify?.routes?.root || "/").trim() || "/";
  const normalizedRoot = `/${root.replace(/^\/+|\/+$/g, "")}`;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedRoot === "/" ? "" : normalizedRoot}/${normalizedPath}`;
}
