/**
 * Cart Tier Progress Bar
 *
 * Displays a tier discount progress bar on the cart page, reacting in real
 * time to Shopify cart updates without modifying theme-owned cart drawers.
 */

'use strict';

import { storefrontPath } from '../assets/widgets/shared/storefront-path.js';

export interface TierRule {
  conditionType?: 'quantity' | 'amount' | string;
  minQuantity?: number;
  minSubtotal?: number;
  discountType?: 'percentage' | 'fixed_amount' | string;
  discountValue?: number;
  customerBuys?: number;
  customerGets?: number;
  bxyDiscountType?: string;
  tierText?: string | null;
}

export interface TierProgressBarConfig {
  enabled?: boolean;
  type?: 'simple' | 'step_based' | string;
  progressText?: string;
  successText?: string;
}

export interface BundleTierProgressMetadata {
  rules?: TierRule[];
  progressBar?: TierProgressBarConfig;
}

export interface CartTierProgressState {
  progressPercent: number;
  message: string;
  isMaxTier: boolean;
  badgeText?: string;
  activeDiscountText?: string | null;
  nextDiscountText?: string | null;
}

function formatDiscountBadge(rule: TierRule, currencySymbol = '$'): string {
  const val = Number(rule.discountValue || 0);
  if (rule.discountType === 'fixed_bundle_price') return `Bundle price: ${formatMoneyCents(val, currencySymbol)}`;
  if (rule.discountType === 'buy_x_get_y') {
    const saving = rule.bxyDiscountType === 'fixed_amount' ? formatMoneyCents(val, currencySymbol) : `${val}%`;
    return `Buy ${rule.customerBuys}, get ${rule.customerGets} at ${saving} off`;
  }
  if (rule.discountType === 'fixed_amount') {
    return `${currencySymbol}${(val / 100).toFixed(2)}`;
  }
  return `${val}%`;
}

function formatMoneyCents(cents: number, currencySymbol = '$'): string {
  return `${currencySymbol}${(cents / 100).toFixed(2)}`;
}

/**
 * Calculates current tier progress from cart line items.
 */
export function calculateCartTierProgress(
  cartItems: any[] = [],
  currencySymbol = '$',
): CartTierProgressState | null {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return null;
  }

  // Find the first cart item carrying bundle tier progress metadata
  let metadata: BundleTierProgressMetadata | null = null;
  let totalBundleQuantity = 0;
  let totalBundlePriceCents = 0;

  for (const item of cartItems) {
    const rawTierProgress = item?.properties?._bundle_tier_progress;
    const rawDisplayProps = item?.properties?._bundle_display_properties;
    let itemTierProgress: any = null;

    if (rawTierProgress) {
      try {
        itemTierProgress = typeof rawTierProgress === 'string' ? JSON.parse(rawTierProgress) : rawTierProgress;
      } catch {
        // Safe bypass
      }
    } else if (rawDisplayProps) {
      try {
        const parsed = typeof rawDisplayProps === 'string' ? JSON.parse(rawDisplayProps) : rawDisplayProps;
        itemTierProgress = parsed?.tierProgress || null;
      } catch {
        // Safe bypass
      }
    }

    if (itemTierProgress?.rules && Array.isArray(itemTierProgress.rules)) {
      if (itemTierProgress.progressBar?.enabled !== true) {
        return null;
      }
      if (!metadata) {
        metadata = itemTierProgress;
      }
      const componentQuantity = Number(item.properties?._bundle_total_quantity);
      const qty = Number.isSafeInteger(componentQuantity) && componentQuantity > 0 ? componentQuantity : Number(item.quantity || 1);
      totalBundleQuantity += qty;
      const retailCents = Number(item.properties?._bundle_total_retail_cents);
      const linePrice = Number.isFinite(retailCents) && retailCents >= 0 ? retailCents : Number(item.line_price || item.final_line_price || (item.price * qty) || 0);
      totalBundlePriceCents += linePrice;
    }
  }

  if (!metadata || !Array.isArray(metadata.rules) || metadata.rules.length === 0) {
    return null;
  }

  if (metadata.progressBar?.enabled !== true) {
    return null;
  }

  const isAmountBased = metadata.rules.some((r) => r.conditionType === 'amount');
  const sortedRules = [...metadata.rules].sort((a, b) => {
    const thresholdA = isAmountBased ? Number(a.minSubtotal || 0) : Number(a.minQuantity || 0);
    const thresholdB = isAmountBased ? Number(b.minSubtotal || 0) : Number(b.minQuantity || 0);
    return thresholdA - thresholdB;
  });

  const currentValue = isAmountBased ? totalBundlePriceCents : totalBundleQuantity;
  const maxRule = sortedRules[sortedRules.length - 1];
  const maxThreshold = isAmountBased ? Number(maxRule.minSubtotal || 0) : Number(maxRule.minQuantity || 0);

  // Check if max tier is achieved
  if (currentValue >= maxThreshold) {
    const maxDiscount = formatDiscountBadge(maxRule, currencySymbol);
    const successTemplate = metadata.progressBar?.successText || "You've unlocked {{discountText}} off!";
    const message = !metadata.progressBar?.successText && ['fixed_bundle_price', 'buy_x_get_y'].includes(maxRule.discountType || '')
      ? maxDiscount : successTemplate.replace('{{discountText}}', maxDiscount);
    return {
      progressPercent: 100,
      message,
      isMaxTier: true,
      badgeText: 'Max Discount Unlocked',
      activeDiscountText: maxDiscount,
      nextDiscountText: null,
    };
  }

  // Find next tier target
  let nextRule = sortedRules[0];
  let activeRule: TierRule | null = null;

  for (let i = 0; i < sortedRules.length; i += 1) {
    const threshold = isAmountBased
      ? Number(sortedRules[i].minSubtotal || 0)
      : Number(sortedRules[i].minQuantity || 0);

    if (currentValue < threshold) {
      nextRule = sortedRules[i];
      activeRule = i > 0 ? sortedRules[i - 1] : null;
      break;
    }
  }

  const nextThreshold = isAmountBased
    ? Number(nextRule.minSubtotal || 0)
    : Number(nextRule.minQuantity || 0);

  const diff = Math.max(0, nextThreshold - currentValue);
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentValue / nextThreshold) * 100)));

  const conditionText = isAmountBased
    ? formatMoneyCents(diff, currencySymbol)
    : `${diff} more`;

  const nextDiscount = formatDiscountBadge(nextRule, currencySymbol);
  const activeDiscount = activeRule ? formatDiscountBadge(activeRule, currencySymbol) : null;

  const suffix = ['fixed_bundle_price', 'buy_x_get_y'].includes(nextRule.discountType || '') ? '' : ' off';
  let message: string;
  if (activeDiscount) {
    message = `${activeDiscount} unlocked! Add ${conditionText} to unlock ${nextDiscount}${suffix}!`;
  } else {
    message = `Add ${conditionText} to unlock ${nextDiscount}${suffix}!`;
  }

  const badgeText = activeDiscount ? `${activeDiscount} Unlocked` : 'Next Milestone';

  return {
    progressPercent,
    message,
    isMaxTier: false,
    badgeText,
    activeDiscountText: activeDiscount,
    nextDiscountText: nextDiscount,
  };
}

const BAR_CLASS = 'wpb-cart-tier-progress-bar';
const TAG_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;

const CHECK_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;

const CART_PAGE_CONTAINER_SELECTORS = [
  '#main-cart-items',
  '.cart-items__wrapper',
  '.cart-page__items',
  '[data-cart-items-wrapper]',
  'form[action="/cart"]',
  '.cart-items',
  '.cart__items',
];

function findCartMountTarget(doc: Document): HTMLElement | null {
  for (const selector of CART_PAGE_CONTAINER_SELECTORS) {
    const targets = doc.querySelectorAll<HTMLElement>(selector);
    for (const target of targets) {
      if (!target.closest('cart-drawer, cart-drawer-component, .cart-drawer, #CartDrawer, .cart-drawer__dialog')) {
        return target;
      }
    }
  }
  return null;
}

function appendStyledMessage(element: Element, rawMessage: string, isMaxTier: boolean): void {
  const doc = element.ownerDocument;
  element.replaceChildren();
  if (isMaxTier) {
    element.append(doc.createTextNode('🎉 '));
    const strong = doc.createElement('strong');
    strong.textContent = rawMessage;
    element.append(strong, doc.createTextNode(' Best tier discount applied.'));
    return;
  }
  const emphasis = /(\d+% off|\d+% unlocked!|\d+ more|\$[\d.]+ more)/gi;
  let cursor = 0;
  for (const match of rawMessage.matchAll(emphasis)) {
    const index = match.index ?? 0;
    if (index > cursor) element.append(doc.createTextNode(rawMessage.slice(cursor, index)));
    const strong = doc.createElement('strong');
    strong.textContent = match[0];
    element.append(strong);
    cursor = index + match[0].length;
  }
  if (cursor < rawMessage.length) element.append(doc.createTextNode(rawMessage.slice(cursor)));
}

/**
 * Renders or updates the Cart Tier Progress Bar in the DOM.
 */
export function renderCartTierProgressBar(
  doc: Document,
  state: CartTierProgressState | null,
): void {
  const existing = doc.querySelector<HTMLElement>(`.${BAR_CLASS}`);

  if (!state) {
    existing?.remove();
    return;
  }

  const mountTarget = findCartMountTarget(doc);
  if (!mountTarget) {
    existing?.remove();
    return;
  }

  let barElement = existing;
  if (!barElement) {
    barElement = doc.createElement('div');
    barElement.className = BAR_CLASS;
    barElement.setAttribute('role', 'region');
    barElement.setAttribute('aria-label', 'Bundle discount progress');

    const headerEl = doc.createElement('div');
    headerEl.className = `${BAR_CLASS}__header`;

    const titleGroup = doc.createElement('div');
    titleGroup.className = `${BAR_CLASS}__title-group`;

    const iconEl = doc.createElement('span');
    iconEl.className = `${BAR_CLASS}__icon`;
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.innerHTML = state.isMaxTier ? CHECK_ICON_SVG : TAG_ICON_SVG;

    const messageEl = doc.createElement('p');
    messageEl.className = `${BAR_CLASS}__message`;
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-live', 'polite');

    titleGroup.appendChild(iconEl);
    titleGroup.appendChild(messageEl);

    const badgeEl = doc.createElement('span');
    badgeEl.className = `${BAR_CLASS}__badge`;

    headerEl.appendChild(titleGroup);
    headerEl.appendChild(badgeEl);

    const trackWrapper = doc.createElement('div');
    trackWrapper.className = `${BAR_CLASS}__track-wrapper`;

    const trackEl = doc.createElement('div');
    trackEl.className = `${BAR_CLASS}__track`;
    trackEl.setAttribute('role', 'progressbar');
    trackEl.setAttribute('aria-valuemin', '0');
    trackEl.setAttribute('aria-valuemax', '100');

    const fillEl = doc.createElement('div');
    fillEl.className = `${BAR_CLASS}__fill`;

    trackEl.appendChild(fillEl);
    trackWrapper.appendChild(trackEl);

    barElement.appendChild(headerEl);
    barElement.appendChild(trackWrapper);
  }

  if (barElement.parentElement !== mountTarget) {
    mountTarget.prepend(barElement);
  }

  // Update dynamic state
  barElement.className = state.isMaxTier ? `${BAR_CLASS} ${BAR_CLASS}--max-tier` : BAR_CLASS;

  const iconEl = barElement.querySelector(`.${BAR_CLASS}__icon`);
  if (iconEl) {
    iconEl.innerHTML = state.isMaxTier ? CHECK_ICON_SVG : TAG_ICON_SVG;
  }

  const messageEl = barElement.querySelector(`.${BAR_CLASS}__message`);
  if (messageEl) {
    appendStyledMessage(messageEl, state.message, state.isMaxTier);
  }

  const badgeEl = barElement.querySelector(`.${BAR_CLASS}__badge`);
  if (badgeEl) {
    badgeEl.textContent = state.badgeText || (state.isMaxTier ? 'Max Discount Unlocked' : 'Next Milestone');
    badgeEl.className = (state.isMaxTier || state.activeDiscountText)
      ? `${BAR_CLASS}__badge ${BAR_CLASS}__badge--unlocked`
      : `${BAR_CLASS}__badge`;
  }

  const trackEl = barElement.querySelector(`.${BAR_CLASS}__track`);
  if (trackEl) {
    trackEl.setAttribute('aria-valuenow', String(state.progressPercent));
  }

  const fillEl = barElement.querySelector<HTMLElement>(`.${BAR_CLASS}__fill`);
  if (fillEl) {
    fillEl.style.width = `${state.progressPercent}%`;
  }
}

/**
 * Fetches /cart.js and syncs the progress bar.
 */
export async function syncCartTierProgressBar(doc: Document = document): Promise<void> {
  try {
    const res = await fetch(storefrontPath('cart.js?app=wolfpackProductBundles'), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const cart = await res.json();
    const currency = (window as any)?.Shopify?.currency?.active
      || cart.currency
      || '$';
    const state = calculateCartTierProgress(cart.items || [], currency === 'USD' ? '$' : currency);
    renderCartTierProgressBar(doc, state);
  } catch {
    // Non-blocking
  }
}

let isInitialized = false;

/**
 * Initializes listeners for cart updates to keep the tier progress bar synchronized.
 */
export function initCartTierProgressBar(doc: Document = document): void {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  void syncCartTierProgressBar(doc);

  doc.addEventListener('shopify:section:load', () => void syncCartTierProgressBar(doc));
  doc.addEventListener('shopify:cart:view', () => void syncCartTierProgressBar(doc));
  doc.addEventListener('shopify:cart:lines-update', (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const completion = detail?.cart ?? detail?.promise ?? detail;
    if (completion && typeof completion.then === 'function') {
      void Promise.resolve(completion).then(() => syncCartTierProgressBar(doc)).catch(() => undefined);
      return;
    }
    void syncCartTierProgressBar(doc);
  });
}

/**
 * Extracts bundle tier progress metadata from a bundle config.
 */
export function extractTierProgressForBundle(bundle: any): BundleTierProgressMetadata | null {
  if (!bundle?.pricing?.enabled) return null;
  const rules = Array.isArray(bundle?.pricing?.rules) ? bundle.pricing.rules : [];
  if (rules.length === 0) return null;

  const progressBar = bundle?.pricing?.displayOptions?.progressBar
    || bundle?.messaging?.displayOptions?.progressBar
    || null;

  const normalizedRules = rules.map((r: any) => {
    const conditionType = r.conditionType || (r.minSubtotal !== undefined ? 'amount' : 'quantity');
    const isAmount = conditionType === 'amount';
    return {
      conditionType,
      minQuantity: isAmount ? undefined : Number(r.conditionValue ?? r.minQuantity ?? 0),
      minSubtotal: isAmount ? Number(r.conditionValue ?? r.minSubtotal ?? 0) : undefined,
      discountType: ['fixed_bundle_price', 'buy_x_get_y'].includes(bundle.pricing.method) ? bundle.pricing.method
        : r.discountType || (bundle.pricing.method === 'fixed_amount_off' ? 'fixed_amount' : 'percentage'),
      customerBuys: r.customerBuys, customerGets: r.customerGets, bxyDiscountType: r.bxyDiscountType,
      discountValue: Number(r.discountValue ?? 0),
      tierText: r.tierText || null,
    };
  });

  return {
    rules: normalizedRules,
    progressBar: progressBar ? {
      enabled: progressBar.enabled === true,
      type: progressBar.type || 'simple',
      progressText: progressBar.progressText,
      successText: progressBar.successText,
    } : { enabled: false, type: 'simple' },
  };
}
