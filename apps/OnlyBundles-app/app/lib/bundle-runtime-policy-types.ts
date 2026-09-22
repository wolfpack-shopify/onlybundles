/**
 * Bundle Runtime Policy Types
 *
 * Versioned schema shared by:
 *   - bundle-runtime-policy.server.ts (compiler)
 *   - bundle-runtime-policy-publisher.server.ts (publisher)
 *   - extensions/bundle-cart-transform-rs (via JSON deserialization)
 *   - extensions/bundle-discount-function (via JSON deserialization)
 *
 * IMPORTANT: schemaVersion must be bumped and migration handled whenever the
 * shape changes in a way that breaks deserialization in existing Rust Functions.
 */

// ---------------------------------------------------------------------------
// Role
// ---------------------------------------------------------------------------

export type BundleLineRole = "component" | "default" | "free_gift" | "addon";

// ---------------------------------------------------------------------------
// Variant selection — controls how the Function matches a cart line variant
// ---------------------------------------------------------------------------

/** Every variant of the product is eligible. */
export type AllProductVariantsSelection = {
  mode: "all_product_variants";
};

/**
 * Only the listed variant IDs are eligible.
 * A product-level match MUST NOT override this restriction.
 */
export type ListedVariantsSelection = {
  mode: "listed_variants";
  variantIds: string[]; // fully-qualified GIDs, e.g. "gid://shopify/ProductVariant/123"
};

export type VariantSelection = AllProductVariantsSelection | ListedVariantsSelection;

// ---------------------------------------------------------------------------
// Group — maps to a bundle step
// ---------------------------------------------------------------------------

export type BundleGroup = {
  id: string;
  role: BundleLineRole;
  minQuantity: number;
  maxQuantity: number;
  requiredProducts?: { productId: string; quantity: number }[];
  /** Amount is in shop-currency cents; weight is in grams. */
  conditions?: BundleGroupCondition[];
  categories?: { id: string; conditions: BundleGroupCondition[] }[];
  tiers?: { id: string; condition: BundleGroupCondition; percentage: number; maxQuantity: number; conditions: BundleGroupCondition[] }[];
};

export type BundleGroupCondition = {
  type: "quantity" | "amount" | "weight";
  operator: "gte" | "lte" | "eq";
  value: number;
};

// ---------------------------------------------------------------------------
// Membership — what a specific product is allowed to do within a group
// ---------------------------------------------------------------------------

export type BundleMembership = {
  groupId: string;
  categories?: { id: string; variantSelection: VariantSelection }[];
  tiers?: { id: string; variantSelection: VariantSelection }[];
  variantSelection: VariantSelection;
  maxQuantity: number;
};

// ---------------------------------------------------------------------------
// Pricing — normalized from existing PriceAdjustment config
// ---------------------------------------------------------------------------

export type BundlePricingMethod =
  | "percentage_off"
  | "fixed_amount_off"
  | "fixed_bundle_price"
  | "buy_x_get_y";

export type BundlePricingCondition = {
  type: "quantity" | "amount";
  operator: "gte" | "gt" | "lte" | "lt" | "eq";
  value: number;
};

export type BundlePricingPolicy = {
  method: BundlePricingMethod;
  value: number;
  conditions?: BundlePricingCondition;
  // BuyXGetY fields
  customerBuys?: number;
  customerGets?: number;
  discountType?: string;
  applyDiscountTo?: string;
  rules?: BundlePricingPolicy[];
};

// ---------------------------------------------------------------------------
// Normalized compiler projection (publisher separates shared rules from membership references)
// ---------------------------------------------------------------------------

export type BundleRuntimePolicy = {
  schemaVersion: 1;
  bundleId: string;
  revision: string;
  bundleName: string;
  parentVariantId: string; // GID of the bundle parent variant
  groups: BundleGroup[];
  memberships: BundleMembership[];
  pricing: BundlePricingPolicy;
  /** Encoded country targeting rule, e.g. "include:AU,NZ" or "". */
  countryRule?: string;
  subscription?: {
    allowedSellingPlanIds: string[];
    recurring: boolean;
    discountAppliesOn: "subscription" | "one_time" | "both";
    oneTimePurchase: boolean;
  };
};

/** Compiler projection; never written directly to a Shopify product. */
export type ComponentProductPoliciesMetafield = {
  policies: BundleRuntimePolicy[];
};

/** Shared rules in each active shop-registry entry. */
export type PublishedRuntimePolicy = Omit<BundleRuntimePolicy, "schemaVersion" | "memberships"> & {
  schemaVersion: 2;
  membershipSets: Record<string, BundleMembership[]>;
};

/** App-owned product evidence: references into the active shared membership sets. */
export type ProductRuntimeMemberships = string[];

// ---------------------------------------------------------------------------
// Parent variant metafield ($app:bundle_parent_policy on ProductVariant)
// ---------------------------------------------------------------------------

export type BundleParentPolicy = {
  schemaVersion: 1;
  bundleId: string;
  revision: string;
  /** Display name — not a trust boundary; used for cart line messaging only. */
  bundleName: string;
};

// ---------------------------------------------------------------------------
// Compiler result — typed Result, never throws for expected failures
// ---------------------------------------------------------------------------

export type PolicyCompileOk = {
  ok: true;
  active: boolean;
  pricingMode: "standard" | "scheduled";
  /** One entry per unique component product GID. */
  productPolicies: Array<{ productId: string; metafield: ComponentProductPoliciesMetafield }>;
  parentPolicy: BundleParentPolicy;
  revision: string;
};

export type PolicyCompileErrorCode =
  | "MISSING_PARENT_VARIANT"
  | "MISSING_BUNDLE_ID"
  | "NO_ELIGIBLE_PRODUCTS"
  | "INVALID_CONFIGURATION"
  | "POLICY_TOO_LARGE";

export type PolicyCompileError = {
  ok: false;
  error: PolicyCompileErrorCode;
  /** Present when error is POLICY_TOO_LARGE. */
  productId?: string;
  details?: string;
};

export type PolicyCompileResult = PolicyCompileOk | PolicyCompileError;

// ---------------------------------------------------------------------------
// Publisher result — typed Result, never throws for expected failures
// ---------------------------------------------------------------------------

export type PolicyPublishOk = {
  ok: true;
  revision: string;
  productCount: number;
};

export type PolicyPublishErrorCode =
  | "POLICY_TOO_LARGE"
  | "STAGE_WRITE_FAILED"
  | "READBACK_MISMATCH"
  | "ACTIVATION_FAILED"
  | "COMPILE_ERROR";

export type PolicyPublishError = {
  ok: false;
  error: PolicyPublishErrorCode;
  details?: string;
};

export type PolicyPublishResult = PolicyPublishOk | PolicyPublishError;
