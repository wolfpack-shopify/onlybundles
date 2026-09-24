const BUNDLE_PREVIEW_QUERY_PARAM = 'wpb_preview';

function currentLocationSearch() {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function currentDesignMode() {
  return typeof window !== 'undefined' && window.Shopify?.designMode === true;
}

export function isBundlePreviewLocation(locationSearch = currentLocationSearch()) {
  return new URLSearchParams(locationSearch).has(BUNDLE_PREVIEW_QUERY_PARAM);
}

export function shouldTrackStorefrontAnalytics({
  locationSearch = currentLocationSearch(),
  designMode = currentDesignMode(),
}: {
  locationSearch?: string;
  designMode?: boolean;
} = {}) {
  return !designMode && !isBundlePreviewLocation(locationSearch);
}

export function scheduleNonCriticalStorefrontTask(task: () => void) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const scheduleWhenIdle = () => {
    const requestIdleCallback = (window as any).requestIdleCallback;
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => task(), { timeout: 2000 });
      return;
    }
    window.setTimeout(task, 0);
  };

  if (document.readyState === 'complete') {
    scheduleWhenIdle();
    return;
  }

  window.addEventListener('load', scheduleWhenIdle, { once: true });
}
