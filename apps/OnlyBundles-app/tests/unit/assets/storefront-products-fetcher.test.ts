import { fetchStorefrontProductsUnified } from '../../../app/assets/widgets/shared/storefront-products-fetcher';

describe('fetchStorefrontProductsUnified', () => {
  const originalWindow = (global as any).window;

  beforeEach(() => {
    (global as any).window = {
      Shopify: { shop: 'test-shop.myshopify.com' },
      __WOLFPACK_PPB_STOREFRONT_RUNTIME__: {
        storefrontAccessToken: 'test-token-123',
        storefrontApiVersion: '2026-07',
      },
    };
  });

  afterEach(() => {
    (global as any).window = originalWindow;
  });

  it('returns empty array when productIds is empty', async () => {
    const products = await fetchStorefrontProductsUnified({ productIds: [] });
    expect(products).toEqual([]);
  });

  it('queries Storefront GraphQL API directly when storefrontAccessToken is available', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          nodes: [
            {
              id: 'gid://shopify/Product/123',
              title: 'Test Product',
              handle: 'test-product',
              options: [],
              variants: {
                nodes: [
                  {
                    id: 'gid://shopify/ProductVariant/456',
                    title: 'Default',
                    price: { amount: '10.00', currencyCode: 'USD' },
                    availableForSale: true,
                    selectedOptions: [],
                  },
                ],
              },
            },
          ],
        },
      }),
    });

    const products = await fetchStorefrontProductsUnified({
      productIds: ['gid://shopify/Product/123'],
      country: 'US',
      fetchImpl: mockFetch as any,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = mockFetch.mock.calls[0];
    expect(endpoint).toBe('https://test-shop.myshopify.com/api/2026-07/graphql.json');
    expect(options.headers['X-Shopify-Storefront-Access-Token']).toBe('test-token-123');
    expect(products.length).toBe(1);
    expect(products[0].title).toBe('Test Product');
    expect(products[0].variants[0].price).toBe('10.00');
  });

  it('falls back to proxy endpoint when storefrontAccessToken is not available', async () => {
    (global as any).window.__WOLFPACK_PPB_STOREFRONT_RUNTIME__ = null;

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          {
            id: 'gid://shopify/Product/123',
            title: 'Proxy Product',
            variants: [],
          },
        ],
      }),
    });

    const products = await fetchStorefrontProductsUnified({
      productIds: ['gid://shopify/Product/123'],
      apiBaseUrl: 'https://example.com',
      fetchImpl: mockFetch as any,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('https://example.com/api/storefront-products?ids=');
    expect(products.length).toBe(1);
    expect(products[0].title).toBe('Proxy Product');
  });

  it('gracefully falls back to proxy endpoint if direct Storefront GraphQL query throws', async () => {
    let callCount = 0;
    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes('/graphql.json')) {
        throw new Error('Storefront API GraphQL rate limit');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          products: [{ id: 'gid://shopify/Product/123', title: 'Fallback Product' }],
        }),
      };
    });

    const products = await fetchStorefrontProductsUnified({
      productIds: ['gid://shopify/Product/123'],
      apiBaseUrl: 'https://example.com',
      fetchImpl: mockFetch as any,
    });

    expect(callCount).toBe(2);
    expect(products.length).toBe(1);
    expect(products[0].title).toBe('Fallback Product');
  });
});
