'use strict';

import { buildBundleSelectionProperties, buildOfferAnalyticsCartProperties } from '../widgets/shared/engine/cart-submit.js';
import { resolvePpbSelectionMetric } from '../widgets/shared/ppb-condition-selections.js';
import { updateShopifyCart } from '../widgets/shared/shopify-cart-actions.js';

function _generateBundleInstanceId(bundleId: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return bundleId + '_' + crypto.randomUUID();
  }
  return bundleId + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
}

function _generateBundleSessionKey() {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var keyLength = 12;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    var bytes = new Uint8Array(keyLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function (byte) {
      return alphabet[byte % alphabet.length];
    }).join('');
  }

  return Math.random().toString(36).slice(2, 2 + keyLength).toUpperCase().padEnd(keyLength, '0');
}

function _resolveProductPageOfferId(state: any) {
  var rawOfferId = state.offerId || state.bundleOfferId || state.bundleId || 'UNKNOWN';
  var offerId = String(rawOfferId);
  return offerId.indexOf('MIX-') === 0 ? offerId : 'MIX-' + offerId;
}

function _formatCartAmount(cents: number, state: any) {
  if (typeof state.formatMoney === 'function') return state.formatMoney(cents);
  return String(cents);
}

function _buildCartLineSourceProperties(state: any, selectedLines: any[]) {
  var retailCents = selectedLines.reduce(function (sum: number, line: any) {
    if (line.step && line.step.isFreeGift) return sum;
    return sum + ((Number(line.product.price) || 0) * line.quantity);
  }, 0);
  var discountCents = Math.max(0, Number(state.discountAmount || 0));
  var discountPercentage = Number(state.discountPercentage || 0);
  if (!discountPercentage && retailCents > 0 && discountCents > 0) {
    discountPercentage = Math.round((discountCents / retailCents) * 100);
  }

  var displayProperties: any = {
    box: '1',
    items: selectedLines.map(function (line: any) {
      return line.quantity + ' x ' + (line.product.title || line.product.id);
    }).join(', '),
    retailPrice: _formatCartAmount(retailCents, state),
  };

  if (discountCents > 0) {
    var amount = _formatCartAmount(discountCents, state);
    var percentage = Math.round(discountPercentage) + '%';
    displayProperties.youSave = {
      amount: amount,
      percentage: percentage,
      amountPercentage: amount + ' (' + percentage + ')',
    };
  }

  return {
    '_bundle_display_properties': JSON.stringify(displayProperties),
  };
}

export function buildCartItems(state: any) {
  var bundleInstanceId = _generateBundleInstanceId(state.bundleId);
  var offerId = _resolveProductPageOfferId(state);
  var sessionKey = _generateBundleSessionKey();
  var itemNumber = 0;
  var items: { id: number; quantity: any; properties: { Box: string; _bundleName: any; '_wolfpackProductBundle:OfferId': string; '_wolfpackProductBundle:prodQty': string; }; }[] = [];
  var unavailable: any[] = [];
  var selectedLines: { product: any; quantity: any; step: any; }[] = [];

  state.steps.forEach(function (step: any, stepIndex: string|number) {
    var stepSelections = state.selections[step.id] || {};
    var productsInStep = (state.stepProductData && state.stepProductData[stepIndex]) || [];

    Object.keys(stepSelections).forEach(function (variantId) {
      var qty = stepSelections[variantId];
      if (!qty || qty <= 0) return;

      var resolved = resolvePpbSelectionMetric(productsInStep, variantId);
      var product = resolved.product;
      var variant = resolved.metric;
      if (!product || !variant) return;

      if (variant.available === false) {
        unavailable.push(product.title || variantId);
        return;
      }

      itemNumber += 1;
      var properties: any = {
        '_bundleName': state.bundleName || '',
        '_wolfpackProductBundle:OfferId': offerId + '_' + sessionKey + '_' + itemNumber,
        '_wolfpackProductBundle:prodQty': String(qty),
      };
      if (step.isFreeGift) properties['_bundle_step_type'] = 'free_gift';
      if (step.isDefault) properties['_bundle_step_type'] = 'default';

      Object.assign(properties, buildBundleSelectionProperties({ bundleId: state.bundleId,
        revision: state.bundleData.runtimePolicyRevision, instanceId: offerId + '_' + sessionKey, groupId: step.id }));
      items.push({
        id: parseInt(variantId, 10),
        quantity: qty,
        properties: properties,
      });
      selectedLines.push({ product: { ...product, price: variant.price }, quantity: qty, step: step });
    });
  });

  if (unavailable.length > 0) {
    throw new Error(
      'The following product' + (unavailable.length > 1 ? 's are' : ' is') +
      ' currently unavailable: ' + unavailable.join(', ') + '.'
    );
  }

  var sourceProperties = buildOfferAnalyticsCartProperties({
    sourceProperties: _buildCartLineSourceProperties(state, selectedLines),
    bundleId: state.bundleId,
    bundleName: state.bundleName,
    offerDelivery: state.bundleData && state.bundleData.offerDelivery,
  });
  items.forEach(item => Object.assign(item.properties, sourceProperties));
  return {
    items: items,
    bundleInstanceId: bundleInstanceId,
    offerId: offerId,
    sessionKey: sessionKey,
    sourceProperties: sourceProperties,
  };
}


export function buildBundleDetailsDisplayProperties(sourceProperties: any) {
  var displayProperties: any = {};
  var raw = sourceProperties && sourceProperties._bundle_display_properties;

  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.box) displayProperties.Box = String(parsed.box);
      if (parsed && parsed.items) displayProperties.Items = String(parsed.items);
      if (parsed && parsed.retailPrice) displayProperties['Retail Price'] = String(parsed.retailPrice);
      if (parsed && parsed.youSave && parsed.youSave.amountPercentage) {
        displayProperties['You Save'] = String(parsed.youSave.amountPercentage);
      }
    } catch (_: any) {}
  }

  ['Box', 'Items', 'Retail Price', 'You Save'].forEach(function (key) {
    if (sourceProperties && sourceProperties[key] && !displayProperties[key]) {
      displayProperties[key] = String(sourceProperties[key]);
    }
  });

  return displayProperties;
}

export function addBundleToCart(state: any, validateBundleFn: any, emitFn: any) {
  var validation = validateBundleFn();
  if (!validation.valid) {
    emitFn('wbp:cart-failed', { error: 'Bundle validation failed. Complete all required steps.' });
    return Promise.resolve();
  }

  var cartResult: any;
  try {
    cartResult = buildCartItems(state);
  } catch (e: any) {
    emitFn('wbp:cart-failed', { error: e.message });
    return Promise.resolve();
  }

  return updateShopifyCart(cartResult.items)
    .then(function (result) {
      emitFn('wbp:cart-success', {
        bundleId: state.bundleId,
        warnings: Array.isArray(result?.warnings) ? result.warnings : [],
      });
    })
    .catch(function (err) {
      emitFn('wbp:cart-failed', { error: err.message });
    });
}
