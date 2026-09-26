import { JSDOM } from 'jsdom';
import {
  isBundlePreviewLocation,
  scheduleNonCriticalStorefrontTask,
  shouldTrackStorefrontAnalytics,
} from '../../../app/assets/widgets/shared/storefront-analytics';
import { fullPageAnalyticsConfigMethods } from '../../../app/assets/widgets/full-page/methods/analytics-config-methods';
import { fullPageTierFloatingRuntimeMethods } from '../../../app/assets/widgets/full-page/methods/tier-floating-runtime-methods';
import { ProductPageWidgetMiscMethods } from '../../../app/assets/widgets/product-page/methods/widget-misc-methods';

describe('storefront analytics policy', () => {
  const originalFetch = global.fetch;
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://example.myshopify.com/',
    });
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).CustomEvent = dom.window.CustomEvent;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    dom.window.close();
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).CustomEvent;
    jest.useRealTimers();
  });

  it('excludes signed-preview locations and Theme Editor sessions', () => {
    expect(isBundlePreviewLocation('?wpb_preview=signed-token')).toBe(true);
    expect(shouldTrackStorefrontAnalytics({ locationSearch: '?wpb_preview=signed-token' })).toBe(false);
    expect(shouldTrackStorefrontAnalytics({ locationSearch: '', designMode: true })).toBe(false);
    expect(shouldTrackStorefrontAnalytics({ locationSearch: '?variant=123', designMode: false })).toBe(true);
  });

  it('defers non-critical work to an idle callback after the page is complete', () => {
    const task = jest.fn();
    const requestIdleCallback = jest.fn((callback) => callback());
    (window as any).requestIdleCallback = requestIdleCallback;
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'complete' });

    scheduleNonCriticalStorefrontTask(task);

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not emit or post FPB analytics from a preview', () => {
    window.history.replaceState({}, '', '/pages/bundle?wpb_preview=signed-token');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const dispatchEvent = jest.spyOn(window, 'dispatchEvent');
    const context = {
      selectedBundle: { id: 'bundle-1' },
      container: { dataset: { bundleId: 'bundle-1', bundleType: 'full_page' } },
      config: { bundleId: 'bundle-1' },
    };

    fullPageAnalyticsConfigMethods._emitStorefrontEvent.call(context, 'bundle-ready');
    fullPageAnalyticsConfigMethods._sendEngagementBeacon.call(context, 'session-engaged');
    fullPageTierFloatingRuntimeMethods._recordView.call(context);

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    dispatchEvent.mockRestore();
  });

  it('does not post PPB views from a preview', () => {
    window.history.replaceState({}, '', '/products/example?wpb_preview=signed-token');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    ProductPageWidgetMiscMethods._recordView.call({
      container: { dataset: { bundleId: 'bundle-2' } },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
