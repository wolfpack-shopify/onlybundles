import { withBundleCartLock } from "../../../../lib/bundle-cart-lock.js";
import { buildCartLineSourceProperties } from '../../shared/engine/cart-lines.js';
import { extractTierProgressForBundle } from '../../shared/engine/cart-lines.js';
import {
  buildBundleSelectionProperties,
  buildOfferAnalyticsCartProperties,
  buildProductPageCartFormData,
} from '../../shared/engine/cart-submit.js';
import { ToastManager } from '../../shared/toast-manager.js';
import { CurrencyManager } from '../../shared/currency-manager.js';
import { PricingCalculator } from '../../shared/pricing-calculator.js';
import {
  calculateBundleDiscountForPurchaseOption,
  calculateBundleTotalForPurchaseOption,
} from '../../shared/subscription-storefront-methods.js';
import { areRequiredProductPageStepsValid } from './step-validation.js';
import { preflightVariantOnStorefront, resolveRuntimeVariantNumericId } from '../../shared/variant-preflight.js';
import { captureDiscountTierState } from '../../shared/discount-tier-feedback.js';
import { hasProductPageHydrationFailure } from './product-data-methods.js';

function getProductPageSelectedQuantityTotal(selectedProducts: any[] = []) {
  return selectedProducts.reduce((sum: number, stepSelections: any) => {
    if (!stepSelections || typeof stepSelections !== 'object') return sum;
    return sum + Object.values<any>(stepSelections).reduce((stepSum: number, quantity: any) => {
      const value = Number(quantity || 0);
      return stepSum + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);
  }, 0);
}

function getProductPageActiveBoxSelectionRule(boxSelection: any) {
  const rules = Array.isArray(boxSelection?.rules) ? boxSelection.rules : [];
  return boxSelection?.activeRule
    || rules.find((rule: any)  => rule?.isDefaultSelected === true)
    || rules[0]
    || null;
}

export const ProductPageCartMethods: Record<string, any> & ThisType<any> = {
  async addToCart() {
    try {
      if (hasProductPageHydrationFailure(this._stepFetchFailed)) return;

      const { totalPrice, totalQuantity } = calculateBundleTotalForPurchaseOption(this,
        this.selectedProducts,
        this.stepProductData,
        this.selectedBundle?.steps
      );

      if (totalQuantity === 0) {
        ToastManager.show('Please select products for your bundle before adding to cart.');
        return;
      }

      const isConditionValidationEnabled = this._isConditionValidationEnabled?.() !== false;
      const allStepsValid = isConditionValidationEnabled
        ? areRequiredProductPageStepsValid(this.selectedBundle.steps, this.validateStep.bind(this))
        : true;

      const addonStepsValid = this.selectedBundle.steps.every((step: any, index: number) =>
        !step.isFreeGift || this.validateStep(index));
      if (!allStepsValid || !addonStepsValid) {
        ToastManager.show('Please complete all bundle steps before adding to cart.');
        return;
      }

      const boxSelectionCheck = this.validateProductPageBoxSelectionCheckout();
      if (!boxSelectionCheck.valid) {
        const template = this._resolveText?.('boxSelectionEligibilityToast_inPage', '')
          || this._resolveText?.('boxSelectionEligibilityToast', '')
          || this._resolveText?.('completeSteps', '');
        ToastManager.show(String(template)
          .replace(/{{boxSelectionDifference}}/g, String(boxSelectionCheck.difference))
          .replace(/{{quantityDifference}}/g, String(boxSelectionCheck.difference))
          .replace(/{{conditionQuantity}}/g, String(boxSelectionCheck.targetQuantity)));
        return;
      }

      const offerId = this.resolveProductPageOfferId();
      const sessionKey = this.generateBundleSessionKey();
      const bundleName = this.selectedBundle?.name || '';
      const sellingPlanId = this.selectedSellingPlanId || '';
      const cartItems = this.buildCartItems(offerId, sessionKey);
      const variantPreflightCache = new Map();
      for (let itemIndex = 0; itemIndex < cartItems.length; itemIndex += 1) {
        const cartItem = cartItems[itemIndex];
        const numericId = resolveRuntimeVariantNumericId(cartItem.id);
        if (!numericId) {
          throw new Error(`runtime-preflight blocked: invalid variant id for cart item ${itemIndex + 1}.`);
        }

        const preflightResult = variantPreflightCache.get(numericId)
          || await preflightVariantOnStorefront(numericId, fetch);
        variantPreflightCache.set(numericId, preflightResult);
        if (!preflightResult?.ok) {
          throw new Error(
            `runtime-preflight blocked: variant ${numericId} in cart item ${itemIndex + 1} (status ${preflightResult?.status || 0}).`,
          );
        }

        cartItem.id = numericId;
      }

      this.elements.addToCartButton.disabled = true;
      this.elements.addToCartButton.textContent = this._resolveText('addingToCart', 'Adding to Cart...');
      this.showLoadingOverlay(this.config?.loadingScreen?.gifUrl || null);

      const cartContext = this.buildProductPageCartFormData(cartItems, {
        bundleName,
        offerId,
        sessionKey,
        sellingPlanId,
      });
      const response = await withBundleCartLock(async () => {
        return fetch('/cart/add.js', {
          method: 'POST',
          body: cartContext.formData
        });
      });
      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `Cart add failed (${response.status})`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.description || errorMessage;
        } catch {
          // Response was not JSON, so the status-code message is clearer.
        }
        throw new Error(errorMessage);
      }

      try {
        JSON.parse(responseText);
      } catch {
        // Shopify can return an HTML cart page after a successful multipart add.
      }

      const successMessage = this._resolveText?.('addBundleSuccess', '');
      if (successMessage) ToastManager.show(successMessage);
      await this._handlePostAddToCartAction(
        this._getProductPageControls()?.redirect,
        `${offerId}_${sessionKey}`,
      );
    } catch (error: any) {
      ToastManager.show('Failed to add bundle to cart: ' + error.message);
    } finally {
      this.hideLoadingOverlay();
      this.updateAddToCartButton();
    }
  },

  validateProductPageBoxSelectionCheckout() {
    const boxSelection = this.selectedBundle?.boxSelection;
    const totalQuantity = getProductPageSelectedQuantityTotal(this.selectedProducts || []);

    if (boxSelection?.validateBoxSelectionQuantity !== true) {
      return { valid: true, totalQuantity, targetQuantity: null, difference: 0 };
    }

    const activeRule = getProductPageActiveBoxSelectionRule(boxSelection);
    const targetQuantity = Number(activeRule?.boxQuantity);
    if (!Number.isFinite(targetQuantity) || targetQuantity < 1) {
      return { valid: true, totalQuantity, targetQuantity: null, difference: 0 };
    }

    return {
      valid: totalQuantity === targetQuantity,
      totalQuantity,
      targetQuantity,
      difference: Math.abs(targetQuantity - totalQuantity),
    };
  },

  buildCartLineSourceProperties(selectedLines: any) {
    const { totalPrice, totalQuantity, unitPrices } = calculateBundleTotalForPurchaseOption(this,
      this.selectedProducts,
      this.stepProductData,
      this.selectedBundle?.steps
    );
    const discountInfo = calculateBundleDiscountForPurchaseOption(
      this,
      totalPrice,
      totalQuantity,
      unitPrices
    );
    const combinedDiscountInfo = this.getDiscountInfoWithSelectedAddonDiscount(discountInfo, totalPrice);
    const currencyInfo = CurrencyManager.getCurrencyInfo();
    const discountAmount = Math.max(0, Number(combinedDiscountInfo.discountAmount || 0));
    const discountPercentage = combinedDiscountInfo.discountPercentage
      || (totalPrice > 0 ? (discountAmount / totalPrice) * 100 : 0);
    return buildCartLineSourceProperties({
      selectedLines,
      retailPrice: CurrencyManager.convertAndFormat(totalPrice, currencyInfo),
      discountAmount: discountAmount > 0
        ? CurrencyManager.convertAndFormat(discountAmount, currencyInfo)
        : '',
      discountPercentage,
      labels: this.getCartLineLabels?.(),
      tierProgress: extractTierProgressForBundle(this.selectedBundle),
    });
  },

  buildCartItems(offerId: any = undefined, sessionKey: any = undefined) {
    if (offerId === undefined) offerId = this.resolveProductPageOfferId();
    if (sessionKey === undefined) sessionKey = this.generateBundleSessionKey();
    const cartItems: { id: number; quantity: unknown; properties: Record<string, any>; _wpbProductId: any; }[] = [];
    const unavailableProducts: any[] = [];
    const selectedLines: { product: any; quantity: unknown; }[] = [];
    const baseOfferId = `${String(offerId)}_${String(sessionKey)}`;
    const hasAddonStepConfigured = (this.selectedBundle?.steps || []).some((step: any) => {
      const addonEval = this.getAddonTierEvaluation?.(step);
      return step?.isFreeGift === true && step?.addonDisplayFree !== true && addonEval?.tier;
    });
    let hasSelectedAddonLine = false;

    this.selectedProducts.forEach((stepSelections: any, stepIndex: string|number) => {
      const productsInStep = this.expandProductsByVariant(this.stepProductData[stepIndex] || []);

      Object.entries(stepSelections).forEach(([variantId, quantity]: any) => {
        if (quantity <= 0) return;
        const product = this.findProductBySelectionKey(productsInStep, variantId);
        if (!product) return;

        if (product.available !== true) {
          unavailableProducts.push(product.title);
          return;
        }

        const step = this.selectedBundle.steps[stepIndex];
        const addonEval = this.getAddonTierEvaluation?.(step) || {};
        const addonDiscount = this.getAddonLineDiscount(step);
        const isChargeableAddonStep = step?.isFreeGift === true && step?.addonDisplayFree !== true;
        const properties: any = {};
          if (isChargeableAddonStep && addonEval?.tier) {
            hasSelectedAddonLine = true;
            properties._addon_product = 'true';
            properties._addon_offer_id = baseOfferId;
            properties._boxProduct = 'addonProduct';
            if (addonEval?.tier?.tierId) {
              properties._addonTierId = String(addonEval.tier.tierId);
            }
          const addonVariantId = this.extractId(variantId);
          properties._uniqueWpbItemKey = `${addonVariantId || variantId}_pageId:addonProduct`;
          properties._bundle_step_type = addonDiscount && step?.addonDisplayFree !== true
            ? `addon:${addonDiscount.type}:${addonDiscount.value}`
            : 'addon';
        } else if (step?.isFreeGift && step?.addonDisplayFree === true) {
          properties._bundle_step_type = 'free_gift';
        }
        if (step?.isDefault || this._isDirectDefaultVariant(variantId)) {
          properties._bundle_step_type = 'default';
        }

        const cartItem: any = {
          id: parseInt(this.extractId(variantId)),
          quantity,
          properties,
        };
        Object.assign(properties, buildBundleSelectionProperties({ bundleId: this.selectedBundle.id,
          revision: this.selectedBundle.runtimePolicyRevision, instanceId: baseOfferId,
          groupId: this._isDirectDefaultVariant(variantId) ? 'default-products' : String(step.id) }));
        cartItems.push(cartItem);
        selectedLines.push({ product, quantity });
      });
    });

    if (unavailableProducts.length > 0) {
      const productList = unavailableProducts.join(', ');
      throw new Error(`The following product${unavailableProducts.length > 1 ? 's are' : ' is'} currently unavailable: ${productList}. Please remove ${unavailableProducts.length > 1 ? 'them' : 'it'} from your bundle or try again later.`);
    }

    const sourceProperties = buildOfferAnalyticsCartProperties({
      sourceProperties: this.buildCartLineSourceProperties(selectedLines),
      bundleId: this.selectedBundle?.id,
      bundleName: this.selectedBundle?.name,
      offerDelivery: this.selectedBundle?.offerDelivery,
      tierId: captureDiscountTierState(this).tierId,
    });
    cartItems.forEach(item => {
      Object.assign(item.properties, sourceProperties);
      if (hasSelectedAddonLine && hasAddonStepConfigured) {
        item.properties._addon_offer_id = item.properties._addon_offer_id || baseOfferId;
      }
    });

    return cartItems;
  },

  buildProductPageCartFormData(cartItems: any, {
    bundleName = '',
    offerId = '',
    sessionKey = '',
    sellingPlanId = '',
  }: any = {}) {
    return buildProductPageCartFormData(cartItems, {
      bundleName,
      offerId,
      sessionKey,
      sellingPlanId,
    });
  },

  resolveProductPageOfferId() {
    const rawOfferId = this.selectedBundle?.offerId
      || this.selectedBundle?.bundleOfferId
      || this.selectedBundle?.id
      || 'UNKNOWN';
    const offerId = String(rawOfferId);
    return offerId.startsWith('MIX-') ? offerId : `MIX-${offerId}`;
  },

  generateBundleSessionKey() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const keyLength = 12;
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(keyLength);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
    }

    return Math.random().toString(36).slice(2, 2 + keyLength).toUpperCase().padEnd(keyLength, '0');
  },

  generateBundleInstanceId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${this.selectedBundle.id}_${crypto.randomUUID()}`;
    }

    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    return `${this.selectedBundle.id}_${timestamp}_${random}`;
  },
};
