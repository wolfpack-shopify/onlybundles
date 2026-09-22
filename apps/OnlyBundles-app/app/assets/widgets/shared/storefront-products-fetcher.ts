import { fetchPpbStorefrontProducts } from '../product-page/storefront-client.js';

export interface StorefrontFetchOptions {
  productIds: string[];
  country?: string | null;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function fetchStorefrontProductsUnified({
  productIds,
  country = null,
  apiBaseUrl = '',
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : (() => Promise.reject(new Error('No fetch available'))) as any),
}: StorefrontFetchOptions): Promise<any[]> {
  if (!productIds || productIds.length === 0) return [];

  // Check for public storefront runtime token
  const runtime = (typeof window !== 'undefined'
    && ((window as any).__WOLFPACK_PPB_STOREFRONT_RUNTIME__
      || (window as any).bundleWidgetContext?.storefrontRuntime)) || null;

  const shop = (typeof window !== 'undefined' && (window as any).Shopify?.shop)
    || (runtime?.shop)
    || (typeof window !== 'undefined' && window.location?.hostname)
    || '';

  if (runtime?.storefrontAccessToken && shop) {
    try {
      const apiVersion = runtime.storefrontApiVersion || '2026-07';
      const products = await fetchPpbStorefrontProducts({
        shop,
        apiVersion,
        accessToken: runtime.storefrontAccessToken,
        productIds,
        country,
        fetchImpl,
      });
      if (Array.isArray(products) && products.length > 0) {
        return products;
      }
    } catch {
      // Fall through to proxy if direct GraphQL request encountered an error
    }
  }

  // Graceful fallback to Remix app-proxy route
  try {
    const countryParam = country ? `&country=${encodeURIComponent(country)}` : '';
    const normalizedIds = productIds.map((id) => (String(id).startsWith('gid://') ? id : `gid://shopify/Product/${id}`));
    const url = `${apiBaseUrl}/api/storefront-products?ids=${encodeURIComponent(normalizedIds.join(','))}${countryParam}`;
    const response = await fetchImpl(url);
    if (response.ok) {
      const data = await response.json();
      return Array.isArray(data?.products) ? data.products : [];
    }
  } catch {
    // Network failure
  }

  return [];
}
