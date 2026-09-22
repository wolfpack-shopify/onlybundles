/**
 * Shared cart submission payload helpers.
 *
 * Transport remains owned by each widget. These helpers only build payload
 * structures that must stay consistent across controller refactors.
 */

'use strict';

import { normalizeOfferAnalyticsDimensions } from '../../../../lib/analytics/offer-dimensions.js';

function normalizeBundleId(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 128 ? normalized : null;
}

export function buildOfferAnalyticsCartProperties({
  sourceProperties = {},
  bundleId,
  bundleName,
  offerDelivery,
  tierId = null,
}: any = {}) {
  const normalizedBundleId = normalizeBundleId(bundleId);
  const dimensions = normalizeOfferAnalyticsDimensions({
    offerPolicyId: offerDelivery?.offerPolicyId,
    offerRuleVersion: offerDelivery?.ruleVersion,
    offerTierId: tierId,
    offerEligibilitySource: offerDelivery?.eligibilitySource,
  });
  const rawDisplayProperties = sourceProperties?._bundle_display_properties;
  const displayProperties = typeof rawDisplayProperties === 'string'
    ? JSON.parse(rawDisplayProperties)
    : {};
  const offerAnalytics: Record<string, string | number> = {};
  const normalizedBundleName = typeof bundleName === 'string' ? bundleName.trim() : '';
  if (normalizedBundleName) displayProperties.bundleName = normalizedBundleName;
  if (normalizedBundleId) offerAnalytics.bundleId = normalizedBundleId;
  if (dimensions.offerPolicyId) offerAnalytics.offerPolicyId = dimensions.offerPolicyId;
  if (dimensions.offerRuleVersion) offerAnalytics.offerRuleVersion = dimensions.offerRuleVersion;
  if (dimensions.offerTierId) offerAnalytics.offerTierId = dimensions.offerTierId;
  if (dimensions.offerEligibilitySource) {
    offerAnalytics.offerEligibilitySource = dimensions.offerEligibilitySource;
  }
  if (Object.keys(offerAnalytics).length > 0) {
    displayProperties.offerAnalytics = offerAnalytics;
  }
  return {
    _bundle_display_properties: JSON.stringify(displayProperties),
  };
}

export function extractBundleDetailsSourceProperties(cartItems: any[] = []) {
  const firstItem = cartItems.find(item => item?.properties?._bundle_display_properties);
  return firstItem?.properties || {};
}

function normalizeSellingPlanIdForCart(value = '') {
  const raw = String(value).trim();
  const match = raw.match(/^gid:\/\/shopify\/SellingPlan\/(\d+)$/);
  return match ? match[1] : raw;
}

export function applySellingPlanToJsonCartItems(items: any[] = [], sellingPlanId = '') {
  if (!sellingPlanId) return items;
  const cartSellingPlanId = normalizeSellingPlanIdForCart(sellingPlanId);
  return items.map(item => {
    const properties: any = { ...(item?.properties || {}) };
    delete properties.Box;
    return {
      ...item,
      selling_plan: cartSellingPlanId,
      properties,
    };
  });
}

/** Buyer choices only. Shopify Functions resolve every rule from app-owned metafields. */
export function buildBundleSelectionProperties(input: { bundleId: string; revision: string; instanceId: string; groupId: string }) {
  const { bundleId, revision, instanceId, groupId } = input;
  if ([bundleId, revision, instanceId, groupId].some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Bundle publication is unavailable. Refresh the bundle before selecting products.');
  }
  const selection = JSON.stringify({ bundleId, revision, instanceId, groupId });
  if (selection.length > 512) throw new Error('Bundle selection identifiers exceed the supported size.');
  return { _wpb_selection: selection };
}
