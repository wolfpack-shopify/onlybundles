export {};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fullPageAnalyticsConfigMethods } = require('../../../app/assets/widgets/full-page/methods/analytics-config-methods.js');
function makeWidgetContext(bundleConfig: unknown, bundleConfigSource?: string) {
  const context: any = {
    container: {
      dataset: {
        bundleType: 'full_page',
        bundleId: 'bundle-1',
        bundleConfig: JSON.stringify(bundleConfig),
        bundleConfigSource,
        countryCode: 'CA',
      },
    },
    bundleData: null,
    _bundleConfigCacheMode: 'none',
  };

  Object.assign(context, fullPageAnalyticsConfigMethods);
  return context;
}

describe('FPB full-page metafield cache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses a complete Shopify Storefront snapshot without fetching bundle JSON', async () => {
    const proxyBundle = {
      id: 'bundle-1',
      bundleType: 'full_page',
      bundleDesignPresetId: 'CLASSIC',
      name: 'Daily Essentials',
      steps: [{ id: 'step-1', name: 'Choose Products', products: [] }],
      pricing: { discountType: 'percentage', discountValue: 10 },
    };
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const widget = makeWidgetContext(proxyBundle, 'shopify_storefront');

    await widget.loadBundleData();

    expect(widget.bundleData).toEqual({ 'bundle-1': proxyBundle });
    expect(widget._bundleConfigCacheMode).toBe('shopify-storefront-inline');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed without fetching when an untrusted full payload is present', async () => {
    const cachedBundle = {
      id: 'bundle-1',
      bundleType: 'full_page',
      bundleDesignPresetId: 'STANDARD',
      name: 'Daily Essentials',
      steps: [{ id: 'step-1', name: 'Choose Products', products: [] }],
    };
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const widget = makeWidgetContext(cachedBundle);

    await expect(widget.loadBundleData()).rejects.toThrow('authoritative Shopify snapshot');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a bootstrap pointer without an API fallback', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any);
    const widget = makeWidgetContext({
      v: 2,
      type: 'full_page',
      bundleType: 'full_page',
      id: 'bundle-1',
    });

    await expect(widget.loadBundleData()).rejects.toThrow('authoritative Shopify snapshot');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

});
