import { safeJsonParse } from "../../../../services/bundles/bundle-configure-handlers.server";
import { BundleType } from "../../../../constants/bundle";
import {
  formatStepCategoriesForRuntime,
} from "../../../../lib/bundle-config/category-runtime";
import { buildOfferDecisionMarker } from "../../../../lib/offer-policy-decision";
import { parsePricingRule } from "../../../../lib/pricing-rule-parser";

const DEFAULT_PROGRESS_MESSAGE = "Add {conditionText} to get {discountText}";
const DEFAULT_SUCCESS_MESSAGE = "Congratulations! You got {discountText}";

function buildFullPageBundlePricing(pricing: any) {
  if (!pricing) {
    return null;
  }

  const parsedMessages = safeJsonParse(pricing.messages, {});
  const ruleMessages = parsedMessages.ruleMessages || {};
  const firstRuleId = Object.keys(ruleMessages)[0];
  const firstRuleMessage = firstRuleId ? ruleMessages[firstRuleId] : null;

  return {
    enabled: pricing.enabled,
    method: pricing.method || "percentage_off",
    rules: safeJsonParse(pricing.rules, []).map((rule: unknown) =>
      parsePricingRule(rule)
    ),
    display: {
      showFooter: pricing.showFooter !== false,
      showDiscountProgressBar: pricing.showProgressBar === true,
    },
    displayOptions: pricing.displayOptions ?? null,
    messages: {
      progress: firstRuleMessage?.discountText || DEFAULT_PROGRESS_MESSAGE,
      qualified: firstRuleMessage?.successMessage || DEFAULT_SUCCESS_MESSAGE,
      showInCart: true,
      showDiscountMessaging: parsedMessages.showDiscountMessaging || false,
      tierTextByRuleId: parsedMessages.tierTextByRuleId || null,
      tierTextByLocaleByRuleId: parsedMessages.tierTextByLocaleByRuleId || null,
    },
  };
}

function buildFullPageBundleMetafieldSteps(steps: any[] = []) {
  return steps.map((step: any, index: number) => {
    const rawStepProducts = Array.isArray(step.StepProduct)
      ? step.StepProduct
      : [];

    const stepProducts = rawStepProducts;

    const categoriesForMetafield = formatStepCategoriesForRuntime(
      step,
      rawStepProducts
    );
    const stepCollections = Array.isArray(step.collections)
      ? step.collections
      : [];

    return {
      id: step.id,
      name: step.name || `Step ${index + 1}`,
      pageTitle: step.pageTitle ?? null,
      multiLangData: step.multiLangData ?? {},
      stepImage: step.stepImage ?? step.timelineIconUrl ?? null,
      position: step.position ?? index + 1,
      minQuantity: step.minQuantity,
      maxQuantity: step.maxQuantity ?? null,
      enabled: step.enabled !== false,
      isDefault: step.isDefault === true,
      isFreeGift: step.isFreeGift === true,
      addonDisplayFree: step.addonDisplayFree === true,
      addonTiers: step.addonTiers ?? [],
      conditionType: step.conditionType ?? null,
      conditionOperator: step.conditionOperator ?? null,
      conditionValue: step.conditionValue ?? null,
      conditionOperator2: step.conditionOperator2 ?? null,
      conditionValue2: step.conditionValue2 ?? null,
      StepProduct: stepProducts,
      StepCategory: Array.isArray(step.StepCategory) ? step.StepCategory : [],
      products: stepProducts.map((product: any) => ({
        ...product,
        id: product.productId,
      })),
      collections: stepCollections.map((c: any) => ({
        id: c.id,
        handle: c.handle,
        title: c.title || "Collection",
      })),
      ...(categoriesForMetafield.length > 0
        ? { categories: categoriesForMetafield }
        : {}),
    };
  });
}

export function buildFullPageBundleMetafieldConfig(bundle: any) {
  if (bundle?.bundleType !== BundleType.FULL_PAGE) {
    throw new Error("FPB metafield config requires bundleType full_page");
  }

  return {
    id: bundle.id,
    shopId: bundle.shopId,
    offerPolicy: bundle.offerPolicy ?? null,
    bundleSubscriptionConfig: bundle.bundleSubscriptionConfig ?? null,
    personalizationData: bundle.personalizationData ?? null,
    defaultProductsData: bundle.defaultProductsData ?? {},
    validateQuantityPerProduct: bundle.validateQuantityPerProduct ?? null,
    name: bundle.name,
    description: bundle.description || "",
    status: bundle.status,
    bundleType: BundleType.FULL_PAGE,
    publicNumber: bundle.publicNumber,
    bundleDesignTemplate: bundle.bundleDesignTemplate ?? null,
    bundleDesignPresetId: bundle.bundleDesignPresetId ?? null,
    templateName: bundle.templateName || null,
    shopifyProductId: bundle.shopifyProductId || null,
    promoBannerBgImage: bundle.promoBannerBgImage ?? null,
    loadingGif: bundle.loadingGif ?? null,
    type: "cart_transform",
    steps: buildFullPageBundleMetafieldSteps(bundle.steps || []),
    pricing: buildFullPageBundlePricing(bundle.pricing),
    offerDelivery: buildOfferDecisionMarker(bundle.offerPolicy ?? null),
    boxSelection: bundle.boxSelection ?? null,
  };
}
