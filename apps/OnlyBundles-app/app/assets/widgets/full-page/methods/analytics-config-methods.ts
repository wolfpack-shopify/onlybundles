import { BUNDLE_WIDGET } from '../../shared/constants.js';
import { BundleDataManager } from '../../shared/bundle-data-manager.js';
import { ToastManager } from '../../shared/toast-manager.js';
import {
  claimCheckoutIntegrationInvocation,
  getCheckoutIntegrationProvider,
  invokeCheckoutIntegrationProvider,
  waitForCheckoutIntegrationCapability,
} from '../../shared/checkout-integration-adapters.js';
import { openShopifyCart } from '../../shared/shopify-cart-actions.js';
import { buildStorefrontApiPath } from '../../../../config/storefront-proxy-routes.js';
import { localizeBundleConfig } from '../../shared/localized-bundle-config.js';
import { replaceManagedStyle } from '../../shared/managed-style.js';
import { captureDiscountTierState } from '../../shared/discount-tier-feedback.js';
import { storefrontPath } from '../../shared/storefront-path.js';
import { shouldTrackStorefrontAnalytics } from '../../shared/storefront-analytics.js';

function parseJsonObject(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const fullPageAnalyticsConfigMethods: Record<string, any> & ThisType<any> = {
_ensureWpbSessionId() {
  if (this._wpbSessionId) return this._wpbSessionId;
  try {
    const bundleId = this.selectedBundle?.id || this.container?.dataset?.bundleId || 'unknown';
    const storageKey = `wpb_session_${bundleId}`;
    const existing = sessionStorage.getItem(storageKey);
    if (existing) { this._wpbSessionId = existing; return existing; }
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `wpb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(storageKey, id);
    this._wpbSessionId = id;
    return id;
  } catch (_e: any) {
    this._wpbSessionId = `wpb-${Date.now()}`;
    return this._wpbSessionId;
  }
},

_emitStorefrontEvent(name: any, detail: any = {}) {
  try {
    if (!shouldTrackStorefrontAnalytics()) return;
    const fullDetail = Object.assign({
      bundleId: this.selectedBundle?.id || null,
      bundleType: this.container?.dataset?.bundleType || 'full_page',
      presetId: this.getFullPageDesignPreset?.() || null,
      sessionId: this._ensureWpbSessionId(),
      timestamp: new Date().toISOString(),
    }, detail);
    window.dispatchEvent(new CustomEvent(`wpb:${name}`, { detail: fullDetail, bubbles: true }));
  } catch (_e: any) {
    // Listener errors must never break the widget.
  }
},

_sendEngagementBeacon(eventName: any) {
  try {
    if (!shouldTrackStorefrontAnalytics()) return;
    const bundleId = this.selectedBundle?.id || this.container?.dataset?.bundleId;
    if (!bundleId) return;
    const guardKey = `wpb_engagement_${eventName}_${bundleId}`;
    if (sessionStorage.getItem(guardKey) === '1') return;
    const sessionId = this._ensureWpbSessionId();
    const shopId = window.Shopify?.shop || this.container?.dataset?.shop || window.location.hostname;
    const payload: any = {
      shopId,
      bundleId,
      sessionId,
      presetId: this.getFullPageDesignPreset?.() || null,
      bundleType: this.container?.dataset?.bundleType || 'full_page',
      eventName: `wpb:${eventName}`,
      landingPage: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
    const tierState = captureDiscountTierState(this);
    Object.assign(payload, {
      offerPolicyId: this.selectedBundle?.offerDelivery?.offerPolicyId ?? null,
      offerRuleVersion: this.selectedBundle?.offerDelivery?.ruleVersion ?? null,
      offerTierId: tierState.tierId,
      offerEligibilitySource: this.selectedBundle?.offerDelivery?.eligibilitySource ?? null,
    });
    sessionStorage.setItem(guardKey, '1');
    fetch(buildStorefrontApiPath('attribution/engagement'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });
  } catch (_e: any) {
    // Beacon failures must never break the widget.
  }
},

async loadLanguageSettings() {
  const runtime = parseJsonObject(this.container.dataset.fpbRuntime);
  if (runtime?.schemaVersion !== 1 || !runtime.languages) return;
  const locale = String(window.Shopify?.locale || 'en').toLowerCase();
  const localeKeys = Object.keys(runtime.languages);
  const exact = localeKeys.find((key) => key.toLowerCase() === locale);
  const baseLocale = locale.split('-')[0];
  const base = localeKeys.find((key) => key.toLowerCase() === baseLocale);
  const languageSettings = runtime.languages[exact || base || 'en'];
  if (!languageSettings) return;
  this.config.languageSettings = languageSettings;
  this.config.languageData = languageSettings.activeLanguageData || null;
  this.config.sharedCartLabels = languageSettings.sharedCartLabels || null;
  this.config.textOverrides = {
    ...(this.config.textOverrides || {}),
    ...(languageSettings.textOverrides || {})
  };
},

async loadControlsSettings() {
  try {
    const runtime = (window as Window & Record<string, any>).__WOLFPACK_SETTINGS_CONTROLS_RUNTIME__;
    if (!runtime?.landingPage) return;
    this.config.controlsSettings = { activeControls: runtime.landingPage };
    const controls = this._getLandingPageControls();
    const builderCss = String(controls?.css?.bundleBuilderPages || '').trim();
    const runtimeDocument = typeof document === 'undefined' ? null : document;
    if (runtimeDocument) replaceManagedStyle(runtimeDocument, 'settings-controls-builder', builderCss);
    const customFont = String(controls?.font?.customFont || '').trim();
    if (customFont) {
      this.container.style.setProperty('--wpb-controls-font-family', customFont);
    } else {
      this.container.style.removeProperty('--wpb-controls-font-family');
    }
    window.__WPB_BUNDLE_BUTTON_SELECTORS__ = {
      addToCartButtons: controls?.selectors?.addToCartButtons || '',
      buyNowButton: controls?.selectors?.buyNowButton || '',
    };
    if (!this._controlsBundleScriptApplied) {
      this._controlsBundleScriptApplied = true;
      this._runControlsScript(controls?.scripts?.bundlePage);
    }
  } catch (_: any) {
    // Non-critical: the widget keeps its current default behavior.
  }
},

_getLandingPageControls() {
  return this.config.controlsSettings?.activeControls
    || this.config.controlsSettings?.settingsControls?.landingPage
    || null;
},

_runControlsScript(script: string) {
  if (!script || typeof script !== 'string') return;
  try {
    new Function(script).call(window);
  } catch (_: any) {
    // Merchant-authored integration script should not block bundle checkout.
  }
},

_getCheckoutIntegrationProvider(providerId: any) {
  return getCheckoutIntegrationProvider(providerId);
},

_isCheckoutIntegrationProvider(providerId: any) {
  return this._getCheckoutIntegrationProvider(providerId).id !== 'native';
},

_getCheckoutIntegrationFallbackTarget(provider: any) {
  return storefrontPath(provider.fallbackAction === 'checkout' ? '/checkout' : '/cart', window);
},

async _openThemeCartDrawer() {
  await openShopifyCart(window);
  return true;
},

_openGokwikCheckout(checkoutUrl: any) {
  try {
    if (typeof window.gokwikSdk?.initCheckout !== 'function') return false;
    window.gokwikSdk.initCheckout({
      checkoutUrl,
    });
    return true;
  } catch {
    return false;
  }
},

_openShopfloCheckout(checkoutUrl: any) {
  try {
    if (typeof window.Shopflo?.openFloCheckout !== 'function') return false;
    window.Shopflo.openFloCheckout(checkoutUrl);
    return true;
  } catch {
    return false;
  }
},

_setCheckoutIntegrationDiscountState(code: string|number|boolean) {
  if (!code) return;
  try {
    sessionStorage.setItem('wpbDiscountCode', String(code));
  } catch (_: any) {
    // Non-critical persistence.
  }
  try {
    document.cookie = `discount_code=${encodeURIComponent(String(code))}; path=/; Secure; SameSite=Lax`;
  } catch (_: any) {
    // Non-critical persistence.
  }
},

async _createCheckoutIntegrationDiscountCode(providerId: any) {
  const response = await fetch(buildStorefrontApiPath('checkout-integration-discount-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ providerId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok || !payload?.code) {
    throw new Error(payload?.error || 'Checkout integration discount code could not be created');
  }
  return payload;
},

async _applyCheckoutIntegrationDiscountCode(code: string|number|boolean) {
  if (!code) return false;
  const discountUrl = `${storefrontPath(`/discount/${encodeURIComponent(code)}`, window)}?redirect=${encodeURIComponent(storefrontPath('/cart', window))}`;
  const response = await fetch(discountUrl, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'follow',
  });
  return response.ok;
},

async _invokeCheckoutIntegrationProvider(providerId: any, options: any = {}) {
  const adapterOptions: any = {
    ...options,
    openThemeCartDrawer: () => this._openThemeCartDrawer(),
    openGokwikCheckout: (checkoutUrl: any) => this._openGokwikCheckout(checkoutUrl),
    openShopfloCheckout: (checkoutUrl: any) => this._openShopfloCheckout(checkoutUrl),
  };
  const capability: any = await waitForCheckoutIntegrationCapability(
    providerId,
    window,
    adapterOptions,
  );
  if (!capability.available) {
    return {
      ok: false,
      phase: 'capability',
      reason: capability.reason || 'capability-unavailable',
      provider: capability.provider,
    };
  }
  return invokeCheckoutIntegrationProvider(providerId, window, adapterOptions);
},

async _handleCheckoutIntegrationProvider(checkout: any) {
  const provider = this._getCheckoutIntegrationProvider(checkout?.providerId || 'native');
  const providerId = provider.id;
  let payload: any = null;

  if (provider.requiresDiscountCode) {
    payload = await this._createCheckoutIntegrationDiscountCode(providerId);
    this._setCheckoutIntegrationDiscountState(payload.code);
    const applied = await this._applyCheckoutIntegrationDiscountCode(payload.code);

    if (!applied) {
      window.location.href = `${storefrontPath(`/discount/${encodeURIComponent(payload.code)}`, window)}?redirect=${encodeURIComponent(storefrontPath('/checkout', window))}`;
      return;
    }

    this._emitStorefrontEvent('checkout-integration-discount-code-created', {
      providerId,
      expiresAt: payload.expiresAt || null,
    });
  }

  const invocation = await this._invokeCheckoutIntegrationProvider(providerId, {
    checkoutUrl: checkout?.checkoutUrl,
    executeScript: () => this._runControlsScript(checkout?.executeScript),
  });
  if (invocation.ok) {
    this._emitStorefrontEvent('checkout-integration-provider-invoked', { providerId });
    return;
  }

  this._emitStorefrontEvent('checkout-integration-provider-fallback', {
    providerId,
    reason: invocation.reason,
    phase: invocation.phase,
  });
  if (payload?.code) {
    window.location.href = `${storefrontPath(`/discount/${encodeURIComponent(payload.code)}`, window)}?redirect=${encodeURIComponent(storefrontPath('/checkout', window))}`;
    return;
  }
  window.location.href = this._getCheckoutIntegrationFallbackTarget(provider);
},

async _handlePostAddToCartAction(actionConfig: any, lifecycleKey: any) {
  const checkout = actionConfig || this._getLandingPageControls()?.checkout || {};
  const provider = getCheckoutIntegrationProvider(checkout.providerId || 'native');

  if (lifecycleKey) {
    this._checkoutIntegrationInvocations ||= new Set();
    if (!claimCheckoutIntegrationInvocation(this._checkoutIntegrationInvocations, lifecycleKey)) {
      return;
    }
  }

  if (provider.id !== 'custom_script') {
    this._runControlsScript(checkout.executeScript);
  }
  const target = storefrontPath(checkout.action === 'checkout' ? '/checkout' : '/cart');
  const providerId = provider.id;
  this._emitStorefrontEvent('checkout-clicked', { target, providerId });

  if (this._isCheckoutIntegrationProvider(providerId)) {
    try {
      await this._handleCheckoutIntegrationProvider(checkout);
      return;
    } catch (error: any) {
      this._emitStorefrontEvent('checkout-integration-provider-fallback', {
        providerId,
        reason: 'discount-code-error',
        message: String(error && error.message || error),
      });
      ToastManager.show('Checkout discount could not be prepared. Redirecting to checkout.');
    }
  }

  setTimeout(() => {
    window.location.href = target;
  }, 1000);
},

parseConfiguration() {
  const dataset = this.container.dataset;

  this.config = {
    bundleId: dataset.bundleId || null,
    isContainerProduct: dataset.isContainerProduct === 'true',
    containerBundleId: dataset.containerBundleId || null,
    showTitle: dataset.showTitle === 'true', // Default to false to avoid duplicate with main header
    showDescription: dataset.showDescription !== 'false',
    showStepNumbers: dataset.showStepNumbers !== 'false',
    showFooterMessaging: dataset.showFooterMessaging !== 'false',
    showStepTimeline: dataset.showStepTimeline !== 'false',
    showCategoryTabs: dataset.showCategoryTabs !== 'false',
    // Custom content from theme editor
    customTitle: dataset.customTitle || null,
    customDescription: dataset.customDescription || null,
    // Quantity selector visibility settings (default: show on both)
    showQuantitySelectorOnCard: dataset.showQuantitySelectorOnCard !== 'false',
    // Messages will be set from bundle.pricing.messages after bundle loads
    discountTextTemplate: 'Add {conditionText} to get {discountText}',
    successMessageTemplate: 'Congratulations! You got {discountText}!',
    showDiscountProgressBar: false,
    discountProgressBarType: 'step_based',
    discountProgressTextTemplate: null,
    discountProgressSuccessTemplate: null,
    currentProductId: window.currentProductId,
    currentProductGid: window.currentProductGid,
    currentProductHandle: window.currentProductHandle,
    currentProductCollections: window.currentProductCollections,
    tierConfig: this.parseTierConfig(dataset.tierConfig || '[]'),
    loadingScreen: {
      gifUrl: dataset.fpbLoadingGif || '',
      backgroundColor: dataset.fpbLoadingBackground || '#ffffff',
    },
  };

  this.tierConfig = this.config.tierConfig;

  // Parse bundle_settings metafield (Settings design display settings — promoBanner, badge, etc.)
  try {
    this.bundleSettings = JSON.parse(dataset.bundleSettings || 'null') || {};
  } catch {
    this.bundleSettings = {};
  }

  this._bundleConfigCacheMode = 'none';
},

_parseBundleConfigPayload(rawValue: string) {
  if (!rawValue || rawValue.trim() === '' || rawValue === 'null' || rawValue === 'undefined') {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch (_error: any) {
    return null;
  }
},

_isBundleConfigBootstrapPayload(payload: any) {
  return !!(
    payload &&
    typeof payload === 'object' &&
    payload.v &&
    payload.type === 'full_page' &&
    typeof payload.id === 'string' &&
    payload.id.trim() !== ''
  );
},

async loadBundleData() {
  const bundleId = this.container.dataset.bundleId;

  if (!bundleId) {
    throw new Error('Full-page bundle ID is required');
  }

  const cachedPayload = this._parseBundleConfigPayload(this.container.dataset.bundleConfig);
  const isAuthoritativeSnapshot =
    this.container.dataset.bundleConfigSource === 'shopify_storefront' &&
    cachedPayload?.id === bundleId &&
    cachedPayload?.bundleType === 'full_page' &&
    Array.isArray(cachedPayload?.steps);
  if (!isAuthoritativeSnapshot) {
    throw new Error('Full-page bundle requires an authoritative Shopify snapshot');
  }
  this.bundleData = { [cachedPayload.id]: cachedPayload };
  this._bundleConfigCacheMode = 'shopify-storefront-inline';
},

selectBundle() {
  this.selectedBundle = localizeBundleConfig(
    BundleDataManager.selectBundle(this.bundleData, this.config),
    window.Shopify?.locale || '',
  );
  if (!this.selectedBundle && this.config?.bundleId && this.bundleData?.[this.config.bundleId]?.bundleType === BUNDLE_WIDGET.BUNDLE_TYPES.FULL_PAGE) {
    this.selectedBundle = this.bundleData[this.config.bundleId];
    this.selectedBundle = localizeBundleConfig(
      this.selectedBundle,
      window.Shopify?.locale || '',
    );
  }
  if (this.selectedBundle) {
    this.config.showStepTimeline = this.resolveShowStepTimeline(
      this.selectedBundle.showStepTimeline ?? null,
      this.config.showStepTimeline
    );
  }

  // Update message templates from bundle pricing messages
  this.updateMessagesFromBundle();
},
};
