import { PricingCalculator } from './pricing-calculator.js';
import {
  applyStorefrontSellingPlanPricingToUnitPrices,
  resolveSubscriptionProductCardPrice,
  shouldApplyStorefrontBundleDiscount,
} from './engine/selling-plan-pricing.js';

export const bundleSubscriptionStorefrontMethods: Record<string, any> & ThisType<any> = {
  getSubscriptionProductCardPrice(price: any) {
    return getSubscriptionProductCardPrice(this, price);
  },
  calculateBundleTotalForPurchaseOption(selectedProducts: any, stepProductData: any, steps: any[]) {
    return calculateBundleTotalForPurchaseOption(
      this,
      selectedProducts,
      stepProductData,
      steps,
    );
  },
  calculateBundleDiscountForPurchaseOption(totalPrice: any, totalQuantity: any, unitPrices: any[] = []) {
    return calculateBundleDiscountForPurchaseOption(
      this,
      totalPrice,
      totalQuantity,
      unitPrices,
    );
  },
};

export function calculateBundleDiscountForPurchaseOption(
  controller: any,
  totalPrice: number,
  totalQuantity: number,
  unitPrices: any[] = [],
) {
  const bundle = controller?.selectedBundle;
  // Optional add-ons have their own tier discount. Base bundle pricing and its
  // qualification thresholds use only paid components, including defaults.
  if (bundle?.steps?.some((step: any) => step?.isFreeGift)) {
    const paid = calculatePaidBundleTotalForPurchaseOption(controller);
    totalPrice = paid.totalPrice;
    totalQuantity = paid.totalQuantity;
    unitPrices = paid.unitPrices;
  }
  const subscription = bundle?.subscription;
  if (subscription?.enabled && !shouldApplyStorefrontBundleDiscount(
    subscription,
    controller?.selectedSellingPlanId,
  )) {
    return PricingCalculator.calculateDiscount(
      { ...bundle, pricing: { ...(bundle?.pricing ?? {}), enabled: false } },
      totalPrice,
      totalQuantity,
      unitPrices,
    );
  }
  return PricingCalculator.calculateDiscount(bundle, totalPrice, totalQuantity, unitPrices);
}

export function getSubscriptionProductCardPrice(controller: any, price: any) {
  return resolveSubscriptionProductCardPrice(
    controller?.selectedBundle?.subscription,
    controller?.selectedSellingPlanId,
    Number(price || 0),
  );
}

export function calculateBundleTotalForPurchaseOption(
  controller: any,
  selectedProducts: any,
  stepProductData: any,
  steps: any[],
) {
  const result = PricingCalculator.calculateBundleTotal(
    selectedProducts,
    stepProductData,
    steps,
  );
  const subscription = controller?.selectedBundle?.subscription;
  const sellingPlanId = controller?.selectedSellingPlanId;
  const plan = subscription?.selectedGroup?.plans?.find?.(
    (candidate: any) => candidate?.id === sellingPlanId,
  );
  if (!subscription?.enabled || !sellingPlanId || !plan) return result;
  const adjusted = applyStorefrontSellingPlanPricingToUnitPrices(
    result.unitPrices,
    plan.pricingPolicies ?? [],
    1,
  );
  return {
    ...result,
    totalPrice: adjusted.totalPrice,
    unitPrices: adjusted.unitPrices,
  };
}

/** Paid components, including defaults, qualify base pricing and add-on tiers. */
export function calculatePaidBundleTotalForPurchaseOption(controller: any) {
  const steps = controller.selectedBundle.steps;
  const paidSelections = controller.selectedProducts.map((selections: any, index: number) =>
    steps[index]?.isFreeGift ? {} : selections);
  return calculateBundleTotalForPurchaseOption(controller, paidSelections, controller.stepProductData, steps);
}
