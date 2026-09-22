/**
 * Bundle Runtime Policy Compiler
 *
 * Pure function — no network calls, no side effects.
 * Produces per-product policy projections to be written to Shopify metafields
 * by bundle-runtime-policy-publisher.server.ts.
 *
 * Each component product receives a projection containing only the rules
 * relevant to that product's membership in this bundle. The Function reads
 * this metafield at execution time without any app server round-trip.
 */

import { createHash } from "node:crypto";
import { buildPriceAdjustmentConfig } from "./bundles/metafield-sync/utils/price-adjustment";
import {
  buildOfferCountryTargetingRule,
  encodeOfferCountryTargetingRule,
} from "../lib/offer-country-eligibility";
import { normalizeProductVariantGid } from "../lib/shopify-product-gid";
import { isOperatorSupported } from "../lib/step-condition-validation";
import { scheduleRevisionMaterial } from "./bundle-authorization-policy.server";
import { resolveOfferSchedule, type OfferPolicyTiming } from "../lib/offer-policy-decision";
import type {
  BundleGroup,
  BundleGroupCondition,
  BundleLineRole,
  BundleMembership,
  BundleParentPolicy,
  BundlePricingPolicy,
  BundleRuntimePolicy,
  ComponentProductPoliciesMetafield,
  PolicyCompileOk,
  PolicyCompileResult,
  VariantSelection,
} from "../lib/bundle-runtime-policy-types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ProductEntry = {
  maxQuantity?: number;
  productId: string;       // fully-qualified GID
  categories?: { id: string; variantSelection: VariantSelection }[];
  tiers?: { id: string; variantSelection: VariantSelection }[];
  variantIds: string[];    // non-empty → listed_variants; empty → all_product_variants
};

type GroupEntry = {
  group: BundleGroup;
  products: ProductEntry[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POLICY_BYTE_BUDGET = 9_500;

function normalizeProductGid(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^gid:\/\/shopify\/Product\/\d+$/.test(s)) return s;
  if (/^\d+$/.test(s)) return `gid://shopify/Product/${s}`;
  return null;
}

function roleForStep(step: {
  isDefault?: boolean;
  isFreeGift?: boolean;
  addonDisplayFree?: boolean;
}): BundleLineRole {
  if (step.isDefault === true) return "default";
  if (step.isFreeGift === true && step.addonDisplayFree === true) return "free_gift";
  if (step.isFreeGift === true) return "addon";
  return "component";
}

function variantIdsFromProduct(product: unknown): string[] {
  const variants: unknown = (product as Record<string, unknown>)?.variants;
  if (!Array.isArray(variants)) return [];
  const ids = variants
    .map((v: unknown) => {
      const raw =
        (v as Record<string, unknown>)?.variantGraphqlId ??
        (v as Record<string, unknown>)?.id ??
        (v as Record<string, unknown>)?.selectionId ??
        (v as Record<string, unknown>)?.graphqlId ??
        (v as Record<string, unknown>)?.variantId;
      return normalizeProductVariantGid(raw as string);
    })
    .filter((id): id is string => Boolean(id));
  if (ids.length !== variants.length) throw new Error("Invalid explicit variant selection");
  return [...new Set(ids)].sort();
}

function variantSelection(variantIds: string[]): VariantSelection {
  if (variantIds.length > 0) {
    return { mode: "listed_variants", variantIds };
  }
  return { mode: "all_product_variants" };
}

function quantityBounds(step: Record<string, unknown>) {
  let minQuantity = 0;
  // Shopify quantity is a GraphQL Int. Absence of a merchant upper bound
  // must not resurrect the retired BundleStep.maxQuantity default of one.
  let maxQuantity = 2_147_483_647;
  if (step.conditionType !== "quantity") return { minQuantity, maxQuantity };
  for (const [operator, rawValue] of [
    [step.conditionOperator, step.conditionValue],
    [step.conditionOperator2, step.conditionValue2],
  ]) {
    if (operator == null && rawValue == null) continue;
    if (typeof operator !== "string" || !isOperatorSupported(operator)
      || typeof rawValue !== "number" || !Number.isSafeInteger(rawValue)
      || rawValue < 0 || rawValue > 2_147_483_647) {
      throw new Error("Invalid step quantity condition");
    }
    if (operator !== "less_than_or_equal_to") minQuantity = Math.max(minQuantity, rawValue);
    if (operator !== "greater_than_or_equal_to") maxQuantity = Math.min(maxQuantity, rawValue);
  }
  if (minQuantity > maxQuantity) throw new Error("Contradictory step quantity conditions");
  return { minQuantity, maxQuantity };
}

function metricConditions(step: Record<string, unknown>): BundleGroupCondition[] | undefined {
  const type = step.conditionType;
  if (type == null || type === "quantity") return undefined;
  if (type !== "amount" && type !== "weight") throw new Error("Unknown step condition type");
  const conditions: BundleGroupCondition[] = [];
  let minimum = 0;
  let maximum = Number.MAX_SAFE_INTEGER;
  for (const [operator, rawValue] of [
    [step.conditionOperator, step.conditionValue],
    [step.conditionOperator2, step.conditionValue2],
  ]) {
    if (operator == null && rawValue == null) continue;
    if (typeof operator !== "string" || !isOperatorSupported(operator)
      || typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue < 0) {
      throw new Error("Invalid step metric condition");
    }
    const value = type === "amount" ? rawValue * 100 : rawValue;
    if (value > Number.MAX_SAFE_INTEGER) throw new Error("Step metric threshold exceeds numeric precision");
    const normalizedOperator = operator === "equal_to" ? "eq"
      : operator === "greater_than_or_equal_to" ? "gte" : "lte";
    if (normalizedOperator !== "lte") minimum = Math.max(minimum, value);
    if (normalizedOperator !== "gte") maximum = Math.min(maximum, value);
    conditions.push({ type, operator: normalizedOperator, value });
  }
  if (minimum > maximum) throw new Error("Contradictory step metric conditions");
  return conditions.length ? conditions : undefined;
}

/**
 * Collect groups and per-product membership entries from bundle steps.
 * Returns null when no eligible products are found.
 */
function collectGroupEntries(bundle: {
  steps?: unknown;
  defaultProductsData?: unknown;
  personalizationData?: unknown;
}): GroupEntry[] | null {
  const entries: GroupEntry[] = [];

  // Step products
  const steps: unknown[] = Array.isArray(bundle.steps) ? [...bundle.steps] : [];
  const personalization = bundle.personalizationData as any;
  if (personalization?.isPersonalizationEnabled === true && personalization.addonProducts?.isEnabled === true) {
    steps.push({ id: 'personalization-addons', isFreeGift: true, addonDisplayFree: false,
      addonTiers: personalization.addonProducts.tiers, StepProduct: [] });
  }
  for (const [idx, step] of steps.entries()) {
    const s = step as Record<string, unknown>;
    if (s.enabled === false) continue;
    const role = roleForStep(s as Parameters<typeof roleForStep>[0]);
    const groupId = String(s.id ?? `step-${idx}`);
    const categories = (Array.isArray(s.StepCategory) ? s.StepCategory : []).map((category: any) => ({
      id: String(category.id),
      conditions: (Array.isArray(category.conditions) ? category.conditions : []).map((rule: any) => {
        const type = rule.type ?? rule.conditionType;
        const savedOperator = rule.operator ?? rule.condition;
        const operator = ({ greaterThanOrEqualTo: "greater_than_or_equal_to", lessThanOrEqualTo: "less_than_or_equal_to", equalTo: "equal_to" } as Record<string, string>)[savedOperator] ?? savedOperator;
        const value = Number(rule.value);
        if (!["quantity", "amount", "weight"].includes(type) || !isOperatorSupported(operator)
          || rule.value == null || rule.value === "" || !Number.isFinite(value) || value < 0) {
          throw new Error("Invalid category condition");
        }
        return { type, operator: operator === "equal_to" ? "eq" : operator === "greater_than_or_equal_to" ? "gte" : "lte",
          value: value * (type === "amount" ? 100 : 1) } as BundleGroupCondition;
      }),
    }));
    const categoryMode = categories.some(category => category.conditions.some((rule: BundleGroupCondition) => rule.value > 0));
    const { minQuantity, maxQuantity } = quantityBounds(categoryMode ? {} : s);
    const conditions = categoryMode ? undefined : metricConditions(s);
    const group: BundleGroup = { id: groupId, role, minQuantity, maxQuantity,
      ...(conditions ? { conditions } : {}),
      ...(categoryMode ? { categories } : {}),
    };
    const products: ProductEntry[] = [];
    const rawTiers = Array.isArray(s.addonTiers) ? s.addonTiers : [];
    if (role === "addon" || role === "free_gift") {
      group.tiers = rawTiers.map((tier: any, index) => {
        const type = String(tier.eligibilityCondition?.type ?? "QUANTITY").toLowerCase();
        const value = tier.eligibilityCondition?.value ?? 0;
        const percentage = role === "free_gift" ? 100 : tier.discount?.value ?? 0;
        if (!["quantity", "amount"].includes(type) || typeof value !== "number" || !Number.isFinite(value) || value < 0
          || typeof percentage !== "number" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100
          || (role === "addon" && percentage > 0 && tier.discount?.type !== "PERCENTAGE")) throw new Error("Invalid add-on tier");
        const tierConditions: BundleGroupCondition[] = (tier.conditions ?? []).map((rule: any) => {
          const type = String(rule.type).toLowerCase();
          const operator = ({ lessThanOrEqualTo: "lte", greaterThanOrEqualTo: "gte", equalTo: "eq" } as Record<string, string>)[rule.condition];
          const value = Number(rule.value);
          if (!["quantity", "amount", "weight"].includes(type) || !operator || !Number.isFinite(value) || value < 0) throw new Error("Invalid add-on quantity condition");
          return { type, operator, value: value * (type === "amount" ? 100 : 1) } as BundleGroupCondition;
        });
        const maximum = Math.min(tier.maxQuantity ?? 2_147_483_647,
          ...tierConditions.filter(rule => rule.type === "quantity" && rule.operator !== "gte").map(rule => rule.value));
        if (!Number.isSafeInteger(maximum) || maximum < 0) throw new Error("Invalid add-on maximum quantity");
        return { id: String(tier.tierId ?? tier.id ?? index), maxQuantity: maximum, conditions: tierConditions,
          condition: { type: type as "quantity" | "amount", operator: "gte", value: value * (type === "amount" ? 100 : 1) }, percentage };
      });
    }
    const stepProducts: unknown[] = [
      ...(Array.isArray(s.StepProduct) ? s.StepProduct : []),
      ...(Array.isArray(s.StepCategory) ? s.StepCategory : []).flatMap((category: any) => Array.isArray(category.products) ? category.products : []),
      ...rawTiers.flatMap((tier: any) => Array.isArray(tier.selectedAddonProducts) ? tier.selectedAddonProducts : []),
    ];
    for (const product of stepProducts) {
      const pid = normalizeProductGid(
        (product as Record<string, unknown>)?.productId ??
        (product as Record<string, unknown>)?.id,
      );
      if (!pid) continue;
      const vids = variantIdsFromProduct(product);
      const categoryMemberships = (Array.isArray(s.StepCategory) ? s.StepCategory : []).flatMap((category: any) => {
        const selected = (Array.isArray(category.products) ? category.products : []).filter((entry: any) => normalizeProductGid(entry.productId ?? entry.id) === pid);
        return selected.length ? [{id: String(category.id), variantSelection: variantSelection([...new Set(selected.flatMap(variantIdsFromProduct))] as string[])}] : [];
      });
      const existing = products.find(product => product.productId === pid);
      if (existing) {
        // A duplicate catalogue reference must never turn an explicit allowlist
        // into permission for every variant of the product.
        existing.variantIds = [...new Set([...existing.variantIds, ...vids])].sort();
        existing.categories = categoryMemberships;
      } else products.push({ productId: pid, variantIds: vids, ...(categoryMemberships.length ? { categories: categoryMemberships } : {}) });
    }

    for (const product of products) {
      if (group.tiers?.length) {
        product.tiers = rawTiers.flatMap((tier: any, index) => {
          const tierProducts = Array.isArray(tier.selectedAddonProducts) && tier.selectedAddonProducts.length ? tier.selectedAddonProducts : (s.StepProduct ?? []);
          const selection = (tierProducts as any[])
            .find((entry: any) => normalizeProductGid(entry.productId ?? entry.id) === product.productId);
          return selection ? [{ id: group.tiers![index].id, variantSelection: variantSelection(variantIdsFromProduct(selection)) }] : [];
        });
      }
    }
    entries.push({ group, products });
  }

  // Default products
  const defaultProductsData = bundle.defaultProductsData as Record<string, unknown> | null | undefined;
  if (defaultProductsData?.isDefaultProductsEnabled === true) {
    const defaultProducts: unknown[] = Array.isArray(defaultProductsData.products)
      ? defaultProductsData.products
      : [];

    const quantities = defaultProducts
      .map((p) => {
        const product = p as Record<string, unknown>;
        const quantity = product?.requiredQuantity;
        if (typeof quantity !== "number" || !Number.isSafeInteger(quantity)
          || quantity < 0 || quantity > 2_147_483_647) {
          throw new Error("Invalid required default quantity");
        }
        return { product, quantity };
      })
      .filter(({ quantity }) => quantity > 0);

    const total = quantities.reduce((sum, { quantity }) => sum + quantity, 0);
    if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
      throw new Error("Required default quantities exceed Shopify quantity limits");
    }

    if (total > 0) {
      const requiredProducts = new Map<string, number>();
      for (const { product, quantity } of quantities) {
        const productId = normalizeProductGid(product.productId ?? product.id);
        if (!productId) throw new Error("Invalid required default product");
        requiredProducts.set(productId, (requiredProducts.get(productId) ?? 0) + quantity);
      }
      const group: BundleGroup = {
        id: "default-products",
        role: "default",
        minQuantity: total,
        maxQuantity: total,
        requiredProducts: [...requiredProducts].map(([productId, quantity]) => ({ productId, quantity })),
      };
      const products: ProductEntry[] = quantities.flatMap(({ product }) => {
        const pid = normalizeProductGid(product?.productId ?? product?.id);
        if (!pid) return [];
        const vids = variantIdsFromProduct(product);
        return [{ productId: pid, variantIds: vids }];
      });
      entries.push({ group, products });
    }
  }

  // Check that at least one product exists across all groups
  const hasProducts = entries.some((e) => e.products.length > 0);
  return hasProducts ? entries : null;
}

/**
 * Build the BundlePricingPolicy from the bundle's pricing config.
 */
function compilePricing(pricing: unknown): BundlePricingPolicy {
  return buildPriceAdjustmentConfig(pricing) as BundlePricingPolicy;
}

/**
 * Stable JSON serializer with sorted keys for deterministic canonical form.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const sorted = Object.keys(obj).filter((key) => obj[key] !== undefined).sort();
  const pairs = sorted.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${pairs.join(",")}}`;
}

/**
 * Compute a stable SHA-256 revision from the canonical policy material.
 */
function computeRevision(material: unknown): string {
  return createHash("sha256").update(stableStringify(material)).digest("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function compileBundleRuntimePolicy(input: {
  bundle: unknown;
  parentVariantId: string;
}): PolicyCompileResult {
  const bundle = input.bundle as Record<string, unknown>;

  // Validate required identity fields
  const parentVariantId = normalizeProductVariantGid(input.parentVariantId);
  if (!parentVariantId) {
    return { ok: false, error: "MISSING_PARENT_VARIANT" };
  }

  const bundleId = String(bundle?.id ?? "").trim();
  if (!bundleId) {
    return { ok: false, error: "MISSING_BUNDLE_ID" };
  }

  // Collect group/product structure
  let groupEntries: GroupEntry[] | null;
  try {
    if (resolveOfferSchedule((bundle.offerPolicy ?? {}) as OfferPolicyTiming).state === "invalid") throw new Error("Invalid bundle publication schedule");
    groupEntries = collectGroupEntries(bundle);
    const quantityLimit = bundle.validateQuantityPerProduct as {isEnabled?: boolean; allowedQuantity?: unknown} | null;
    if (quantityLimit?.isEnabled) {
      const maximum = Number(quantityLimit.allowedQuantity);
      if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error("Invalid per-product quantity ceiling");
      for (const entry of groupEntries ?? []) if (entry.group.role !== "default") {
        for (const product of entry.products) product.maxQuantity = maximum;
      }
    }
  } catch (error) {
    return { ok: false, error: "INVALID_CONFIGURATION", details: String(error) };
  }
  if (!groupEntries) {
    return { ok: false, error: "NO_ELIGIBLE_PRODUCTS" };
  }

  // Compile pricing
  const pricing = compilePricing(bundle.pricing);

  // Compile country rule
  const countryRule = encodeOfferCountryTargetingRule(
    buildOfferCountryTargetingRule(bundle.offerPolicy as Parameters<typeof buildOfferCountryTargetingRule>[0]),
  );

  const rawSubConfig = bundle.bundleSubscriptionConfig as Record<string, any> | null | undefined;
  let subscription: BundleRuntimePolicy["subscription"];
  if (rawSubConfig?.enabled === true) {
    const ids = rawSubConfig.selectedPlanIds;
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== "string" || !/^gid:\/\/shopify\/SellingPlan\/\d+$/.test(id))) {
      return { ok: false, error: "INVALID_CONFIGURATION", details: "Subscription requires valid allowed selling plans" };
    }
    const target = rawSubConfig.bundleDiscountAppliesOn ?? "both";
    if (!["subscription", "one_time", "both"].includes(target)) return { ok: false, error: "INVALID_CONFIGURATION", details: "Invalid subscription discount target" };
    subscription = { allowedSellingPlanIds: [...new Set(ids)].sort(), recurring: rawSubConfig.recurringBundleDiscount === true,
      discountAppliesOn: target, oneTimePurchase: rawSubConfig.oneTimePurchase?.enabled !== false };
  }

  // Compute revision from stable policy material
  const revisionMaterial = {
    schemaVersion: 2,
    bundleId,
    bundleName: String(bundle.name ?? ""),
    parentVariantId,
    groups: groupEntries,
    pricing,
    countryRule: countryRule || undefined,
    subscription,
    active: bundle.status === "active" || bundle.status === "unlisted",
    schedule: scheduleRevisionMaterial(bundle.offerPolicy as OfferPolicyTiming | null),
  };
  const revision = computeRevision(revisionMaterial);

  // Build groups array (de-duplicated)
  const groups: BundleGroup[] = groupEntries.map(({ group }) => group);

  // Index products: productId → { variantIds per group }
  // A product may appear in multiple groups; we collect all memberships.
  const productMemberships = new Map<
    string,
    { memberships: BundleMembership[] }
  >();

  for (const { group, products } of groupEntries) {
    for (const { productId, variantIds, categories, tiers, maxQuantity } of products) {
      if (!productMemberships.has(productId)) {
        productMemberships.set(productId, { memberships: [] });
      }
      const entry = productMemberships.get(productId)!;
      entry.memberships.push({
        groupId: group.id,
        ...(categories?.length ? { categories } : {}),
        ...(tiers ? { tiers } : {}),
        variantSelection: variantSelection(variantIds),
        maxQuantity: Math.min(group.maxQuantity, maxQuantity ?? group.maxQuantity),
      });
    }
  }

  // Build per-product projections
  const productPolicies: PolicyCompileOk["productPolicies"] = [];

  for (const [productId, { memberships }] of productMemberships) {
    const policy: BundleRuntimePolicy = {
      schemaVersion: 1,
      bundleId,
      revision,
      parentVariantId,
      bundleName: String(bundle.name ?? ""),
      groups,
      memberships,
      pricing,
      ...(countryRule ? { countryRule } : {}),
      ...(subscription ? { subscription } : {}),
    };

    const metafield: ComponentProductPoliciesMetafield = { policies: [policy] };
    const byteSize = Buffer.byteLength(JSON.stringify(metafield), "utf8");

    if (byteSize > POLICY_BYTE_BUDGET) {
      return {
        ok: false,
        error: "POLICY_TOO_LARGE",
        productId,
        details: `Serialized size ${byteSize} bytes exceeds budget of ${POLICY_BYTE_BUDGET} bytes`,
      };
    }

    productPolicies.push({ productId, metafield });
  }

  const parentPolicy: BundleParentPolicy = {
    schemaVersion: 1,
    bundleId,
    revision,
    bundleName: String(bundle.name ?? ""),
  };

  return {
    ok: true, productPolicies, parentPolicy, revision,
    active: revisionMaterial.active,
    pricingMode: revisionMaterial.schedule.mode === "always" ? "standard" : "scheduled",
  };
}
