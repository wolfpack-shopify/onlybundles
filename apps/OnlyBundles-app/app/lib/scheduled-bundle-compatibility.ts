export type ScheduledBundleIncompatibility =
  | "lowest_priced_buy_x_get_y"
  | "hidden_component_quantity_tier"
  | "hidden_component_identity_tier"
  | "addon_hidden_component_dependency"
  | "variant_specific_gift"
  | "per_component_discount_allocation";

type JsonRecord = Record<string, unknown>;

export type ScheduledBundleCompatibilityInput = {
  discountData?: unknown;
  steps?: unknown;
  addonTiers?: unknown;
};

const IDENTITY_FIELDS = [
  "productIds",
  "variantIds",
  "groupIds",
  "stepIds",
  "eligibleProductIds",
  "eligibleVariantIds",
  "eligibleGroupIds",
  "eligibleStepIds",
] as const;

const GIFT_TRIGGER_FIELDS = [
  "triggerVariantIds",
  "qualifyingVariantIds",
  "requiredBaseVariantIds",
  "sourceVariantIds",
] as const;

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizedMetric(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasValues(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function hasIdentitySelector(value: JsonRecord): boolean {
  return IDENTITY_FIELDS.some((field) => hasValues(value[field]));
}

function hasGiftVariantTrigger(value: JsonRecord): boolean {
  return GIFT_TRIGGER_FIELDS.some((field) => hasValues(value[field]));
}

function collectAddonTiers(input: ScheduledBundleCompatibilityInput): JsonRecord[] {
  const tiers = list(input.addonTiers).flatMap((tier) => {
    const parsed = record(tier);
    return parsed ? [parsed] : [];
  });

  for (const stepValue of list(input.steps)) {
    const step = record(stepValue);
    if (!step || step.enabled === false || step.isFreeGift !== true) continue;
    for (const tierValue of list(step.addonTiers)) {
      const tier = record(tierValue);
      if (tier) tiers.push(tier);
    }
  }
  return tiers;
}

/**
 * Returns the authoritative reasons a scheduled discount cannot be reproduced
 * from the merged parent and any separate add-on or gift lines.
 */
export function getScheduledBundleIncompatibilities(
  input: ScheduledBundleCompatibilityInput,
): ScheduledBundleIncompatibility[] {
  const reasons = new Set<ScheduledBundleIncompatibility>();
  const discount = record(input.discountData);
  const discountEnabled = discount?.discountEnabled === true
    || discount?.enabled === true;
  const method = String(discount?.discountType ?? discount?.method ?? "");
  const rules = list(discount?.discountRules ?? discount?.rules).flatMap((value) => {
    const rule = record(value);
    return rule ? [rule] : [];
  });

  if (discountEnabled) {
    if (method === "buy_x_get_y") {
      if (rules.some((rule) => (rule.bxyApplyMode ?? rule.applyDiscountTo ?? "lowest_priced") === "lowest_priced")) {
        reasons.add("lowest_priced_buy_x_get_y");
      }
      if (rules.some((rule) => (rule.bxyApplyMode ?? rule.applyDiscountTo ?? "lowest_priced") !== "lowest_priced")) {
        reasons.add("per_component_discount_allocation");
      }
    }

    if (rules.some((rule) => normalizedMetric(rule.conditionType) === "quantity")) {
      reasons.add("hidden_component_quantity_tier");
    }
    if (rules.some(hasIdentitySelector)) {
      reasons.add("hidden_component_identity_tier");
    }
    if (rules.some((rule) =>
      hasValues(rule.componentDiscounts)
      || ["individual_components", "per_component"].includes(String(rule.allocationMode ?? "")))) {
      reasons.add("per_component_discount_allocation");
    }
  }

  const addonTiers = collectAddonTiers(input);
  if (addonTiers.some((tier) => {
    const eligibility = record(tier.eligibilityCondition);
    const eligibilityMetric = normalizedMetric(
      eligibility?.type ?? tier.eligibilityType,
    );
    if (eligibilityMetric && eligibilityMetric !== "amount") return true;
    if (hasIdentitySelector(tier) || (eligibility && hasIdentitySelector(eligibility))) {
      return true;
    }
    return list(tier.conditions).some((conditionValue) => {
      const condition = record(conditionValue);
      const metric = normalizedMetric(condition?.type ?? condition?.conditionType);
      return metric !== "" && metric !== "amount";
    });
  })) {
    reasons.add("addon_hidden_component_dependency");
  }

  for (const stepValue of list(input.steps)) {
    const step = record(stepValue);
    if (!step || step.enabled === false || step.isFreeGift !== true) continue;
    if (hasGiftVariantTrigger(step)
      || list(step.addonTiers).some((tierValue) => {
        const tier = record(tierValue);
        return tier ? hasGiftVariantTrigger(tier) : false;
      })) {
      reasons.add("variant_specific_gift");
    }
  }

  return [...reasons];
}
