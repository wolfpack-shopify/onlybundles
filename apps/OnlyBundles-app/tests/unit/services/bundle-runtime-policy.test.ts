import { compileBundleRuntimePolicy } from "../../../app/services/bundle-runtime-policy.server";
import type { PolicyCompileOk } from "../../../app/lib/bundle-runtime-policy-types";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const SHOP = "test.myshopify.com";
const BUNDLE_ID = "bundle-abc";
const PARENT_VARIANT_ID = "gid://shopify/ProductVariant/999";

const PRODUCT_1_ID = "gid://shopify/Product/1";
const PRODUCT_2_ID = "gid://shopify/Product/2";
const PRODUCT_3_ID = "gid://shopify/Product/3";

const V1 = "gid://shopify/ProductVariant/10";
const V2 = "gid://shopify/ProductVariant/20";
const V3 = "gid://shopify/ProductVariant/30";

function makeBundle(overrides: Record<string, unknown> = {}) {
  return {
    id: BUNDLE_ID,
    status: "active",
    name: "Test Bundle",
    steps: [
      {
        id: "step-1",
        minQuantity: 0,
        maxQuantity: 10,
        isFreeGift: false,
        isDefault: false,
        addonDisplayFree: false,
        StepProduct: [
          {
            productId: PRODUCT_1_ID,
            variants: [{ id: V1 }, { id: V2 }, { id: V3 }],
          },
          { productId: PRODUCT_2_ID, variants: [] },
          { productId: PRODUCT_3_ID, variants: [] },
        ],
      },
    ],
    pricing: {
      enabled: true,
      method: "buy_x_get_y",
      rules: [
        {
          id: "rule-1",
          conditionType: "quantity",
          conditionValue: 3,
          conditionOperator: "gte",
          discountValue: 100,
          customerBuys: 2,
          customerGets: 1,
          bxyDiscountType: "percentage",
          bxyApplyMode: "lowest_priced",
        },
      ],
    },
    defaultProductsData: { isDefaultProductsEnabled: false },
    offerPolicy: null,
    bundleSubscriptionConfig: null,
    shopId: SHOP,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Compiler — happy path
// ---------------------------------------------------------------------------

describe("compileBundleRuntimePolicy — BuyXGetY", () => {
  test("specific-link visibility does not change published purchase rules", () => {
    const compile = (specificLinkRequired: boolean) => compileBundleRuntimePolicy({
      bundle: makeBundle({ offerPolicy: { scheduleMode: "always", specificLinkRequired } }),
      parentVariantId: PARENT_VARIANT_ID,
    });
    const publicOffer = compile(false);
    expect(publicOffer.ok).toBe(true);
    expect(compile(true)).toEqual(publicOffer);
  });

  test("produces one policy projection per unique component product", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle(),
      parentVariantId: PARENT_VARIANT_ID,
    });
    expect(result.ok).toBe(true);
    const ok = result as PolicyCompileOk;
    // Product 1 has explicit variants → listed_variants
    // Products 2 and 3 have no variants → all_product_variants
    expect(ok.productPolicies).toHaveLength(3);
    const ids = ok.productPolicies.map((p) => p.productId).sort();
    expect(ids).toEqual([PRODUCT_1_ID, PRODUCT_2_ID, PRODUCT_3_ID].sort());
  });

  test("product with explicit variants uses listed_variants mode", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle(),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    const product1 = result.productPolicies.find((p) => p.productId === PRODUCT_1_ID)!;
    const policy = product1.metafield.policies[0];
    expect(policy.memberships[0].variantSelection.mode).toBe("listed_variants");
    if (policy.memberships[0].variantSelection.mode === "listed_variants") {
      expect(policy.memberships[0].variantSelection.variantIds).toEqual(
        expect.arrayContaining([V1, V2, V3]),
      );
      expect(policy.memberships[0].variantSelection.variantIds).toHaveLength(3);
    }
  });

  test("product with no variants uses all_product_variants mode", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle(),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    const product2 = result.productPolicies.find((p) => p.productId === PRODUCT_2_ID)!;
    expect(product2.metafield.policies[0].memberships[0].variantSelection.mode).toBe(
      "all_product_variants",
    );
  });

  test("listed_variants does not fall back even if only 2 of 3 variants listed", () => {
    const bundle = makeBundle();
    bundle.steps[0].StepProduct[0].variants = [{ id: V1 }, { id: V2 }]; // only 2
    const result = compileBundleRuntimePolicy({
      bundle,
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    const product1 = result.productPolicies.find((p) => p.productId === PRODUCT_1_ID)!;
    const sel = product1.metafield.policies[0].memberships[0].variantSelection;
    expect(sel.mode).toBe("listed_variants");
    if (sel.mode === "listed_variants") {
      expect(sel.variantIds).toHaveLength(2);
      expect(sel.variantIds).not.toContain(V3);
    }
  });

  test("pricing reflects BuyXGetY config", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle(),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    const pricing = result.productPolicies[0].metafield.policies[0].pricing;
    expect(pricing.method).toBe("buy_x_get_y");
    expect(pricing.customerBuys).toBe(2);
    expect(pricing.customerGets).toBe(1);
    expect(pricing.discountType).toBe("percentage");
    expect(pricing.value).toBe(100);
  });

  test("each product projection serializes under 9500 bytes", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle(),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    for (const { metafield } of result.productPolicies) {
      expect(Buffer.byteLength(JSON.stringify(metafield), "utf8")).toBeLessThan(9500);
    }
  });

  test("revision is deterministic SHA-256 of canonical JSON", () => {
    const bundle = makeBundle();
    const r1 = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
    const r2 = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
    expect(r1.revision).toBe(r2.revision);
    expect(r1.revision).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  test("revision changes when pricing changes", () => {
    const a = makeBundle();
    const b = makeBundle();
    (b.pricing.rules[0] as any).discountValue = 50;
    const ra = (compileBundleRuntimePolicy({ bundle: a, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk).revision;
    const rb = (compileBundleRuntimePolicy({ bundle: b, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk).revision;
    expect(ra).not.toBe(rb);
  });

  test.each(["product", "variant", "status", "schedule"])("revision changes when %s authorization changes", (change) => {
    const a = makeBundle();
    const b = makeBundle();
    if (change === "product") b.steps[0].StepProduct[1].productId = "gid://shopify/Product/400";
    if (change === "variant") b.steps[0].StepProduct[0].variants.pop();
    if (change === "status") b.status = "draft";
    if (change === "schedule") b.offerPolicy = { scheduleMode: "one_time", startsAt: "2026-09-20T00:00:00Z", endsAt: "2026-09-21T00:00:00Z" } as any;
    const compile = (bundle: unknown) => compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
    expect(compile(a).revision).not.toBe(compile(b).revision);
  });

  test("preserves every pricing tier", () => {
    const bundle = makeBundle();
    bundle.pricing.rules.push({ ...bundle.pricing.rules[0], id: "second", customerBuys: 4, customerGets: 2 });
    const result = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
    expect(result.productPolicies[0].metafield.policies[0].pricing.rules).toHaveLength(2);
  });

  test("malformed explicit variants never become product-wide authorization", () => {
    const bundle = makeBundle();
    bundle.steps[0].StepProduct[0].variants = [{ id: "invalid" }];
    expect(compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID })).toMatchObject({ ok: false });
  });

  test("all policies share the same revision", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle(),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    const revisions = result.productPolicies.map((p) => p.metafield.policies[0].revision);
    expect(new Set(revisions).size).toBe(1);
    expect(revisions[0]).toBe(result.revision);
  });

  test("schemaVersion is 1 on every policy", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle(),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    for (const { metafield } of result.productPolicies) {
      for (const policy of metafield.policies) {
        expect(policy.schemaVersion).toBe(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Compiler — step roles
// ---------------------------------------------------------------------------

describe("compileBundleRuntimePolicy — step roles", () => {
  function makeSingleProductBundle(stepOverrides: Record<string, unknown>) {
    const bundle = makeBundle();
    bundle.steps[0] = {
      ...bundle.steps[0],
      StepProduct: [{ productId: PRODUCT_1_ID, variants: [] }],
      ...stepOverrides,
    };
    return bundle;
  }

  test("free_gift role when isFreeGift=true and addonDisplayFree=true", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeSingleProductBundle({ isFreeGift: true, addonDisplayFree: true }),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    expect(result.productPolicies[0].metafield.policies[0].groups[0].role).toBe("free_gift");
  });

  test("addon role when isFreeGift=true and addonDisplayFree=false", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeSingleProductBundle({ isFreeGift: true, addonDisplayFree: false }),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    expect(result.productPolicies[0].metafield.policies[0].groups[0].role).toBe("addon");
  });

  test("default role when isDefault=true", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeSingleProductBundle({ isDefault: true }),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    expect(result.productPolicies[0].metafield.policies[0].groups[0].role).toBe("default");
  });

  test("component role when no special flags", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeSingleProductBundle({}),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    expect(result.productPolicies[0].metafield.policies[0].groups[0].role).toBe("component");
  });
});

// ---------------------------------------------------------------------------
// Compiler — default products group
// ---------------------------------------------------------------------------

describe("compileBundleRuntimePolicy — defaultProductsData", () => {
  test("emits default-products group when enabled with requiredQuantity", () => {
    const bundle = makeBundle({
      steps: [],
      defaultProductsData: {
        isDefaultProductsEnabled: true,
        products: [
          { productId: PRODUCT_1_ID, variants: [], requiredQuantity: 2 },
        ],
      },
    });
    const result = compileBundleRuntimePolicy({
      bundle,
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    expect(result.ok).toBe(true);
    const policy = result.productPolicies[0].metafield.policies[0];
    const defGroup = policy.groups.find((g) => g.id === "default-products");
    expect(defGroup).toBeDefined();
    expect(defGroup!.minQuantity).toBe(2);
    expect(defGroup!.maxQuantity).toBe(2);
    expect(defGroup!.role).toBe("default");
  });
});

// ---------------------------------------------------------------------------
// Compiler — country rule
// ---------------------------------------------------------------------------

describe("compileBundleRuntimePolicy — country rule", () => {
  test("encodes country rule on each policy", () => {
    const bundle = makeBundle({
      offerPolicy: {
        countryTargetingEnabled: true,
        countryTargetingMode: "include",
        countryCodes: ["AU", "NZ"],
      },
    });
    const result = compileBundleRuntimePolicy({
      bundle,
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    for (const { metafield } of result.productPolicies) {
      expect(metafield.policies[0].countryRule).toBe("include:AU,NZ");
    }
  });

  test("omits countryRule when targeting disabled", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle({ offerPolicy: { countryTargetingEnabled: false, countryCodes: ["AU"] } }),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    for (const { metafield } of result.productPolicies) {
      expect(metafield.policies[0].countryRule).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Compiler — subscription allowed plans
// ---------------------------------------------------------------------------

describe("compileBundleRuntimePolicy — subscription", () => {
  test("allowedSellingPlanIds present when subscription config provided", () => {
    const bundle = makeBundle({
      bundleSubscriptionConfig: {
        enabled: true,
        selectedPlanIds: ["gid://shopify/SellingPlan/1", "gid://shopify/SellingPlan/2"],
        recurringBundleDiscount: false,
        bundleDiscountAppliesOn: "both",
      },
    });
    const result = compileBundleRuntimePolicy({
      bundle,
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    for (const { metafield } of result.productPolicies) {
      expect(metafield.policies[0].subscription?.allowedSellingPlanIds).toEqual(
        expect.arrayContaining(["gid://shopify/SellingPlan/1", "gid://shopify/SellingPlan/2"]),
      );
    }
  });

  test("allowedSellingPlanIds absent when no subscription config", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle(),
      parentVariantId: PARENT_VARIANT_ID,
    }) as PolicyCompileOk;
    for (const { metafield } of result.productPolicies) {
      expect(metafield.policies[0].subscription?.allowedSellingPlanIds).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Compiler — policy size budget
// ---------------------------------------------------------------------------

describe("compileBundleRuntimePolicy — size budget", () => {
  test("returns POLICY_TOO_LARGE when a product projection exceeds 9500 bytes", () => {
    // Create a bundle with many groups to inflate a single product's policy
    const manyGroups = Array.from({ length: 60 }, (_, i) => ({
      id: `step-${i}`,
      minQuantity: 0,
      maxQuantity: 10,
      isFreeGift: false,
      isDefault: false,
      addonDisplayFree: false,
      StepProduct: [{ productId: PRODUCT_1_ID, variants: [] }],
    }));
    const bundle = makeBundle({ steps: manyGroups });
    const result = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("POLICY_TOO_LARGE");
      expect(result.productId).toBe(PRODUCT_1_ID);
    }
  });
});

// ---------------------------------------------------------------------------
// Compiler — validation errors
// ---------------------------------------------------------------------------

describe("compileBundleRuntimePolicy — validation errors", () => {
  test("MISSING_PARENT_VARIANT when parentVariantId is empty", () => {
    const result = compileBundleRuntimePolicy({ bundle: makeBundle(), parentVariantId: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("MISSING_PARENT_VARIANT");
  });

  test("MISSING_BUNDLE_ID when bundle.id is empty", () => {
    const result = compileBundleRuntimePolicy({
      bundle: makeBundle({ id: "" }),
      parentVariantId: PARENT_VARIANT_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("MISSING_BUNDLE_ID");
  });

  test("NO_ELIGIBLE_PRODUCTS when all steps are empty", () => {
    const bundle = makeBundle({
      steps: [
        {
          id: "step-1",
          minQuantity: 0,
          maxQuantity: 5,
          isFreeGift: false,
          isDefault: false,
          addonDisplayFree: false,
          StepProduct: [],
        },
      ],
      defaultProductsData: { isDefaultProductsEnabled: false },
    });
    const result = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NO_ELIGIBLE_PRODUCTS");
  });
});

// ---------------------------------------------------------------------------
// Compiler — multi-bundle product (product in 2 different bundles)
// ---------------------------------------------------------------------------

describe("compileBundleRuntimePolicy — multi-bundle product", () => {
  test("each bundle call produces only its own policy for the shared product", () => {
    const bundleA = makeBundle({ id: "bundle-A" });
    const bundleB = makeBundle({ id: "bundle-B", steps: makeBundle({ id: "bundle-B" }).steps });

    const resultA = compileBundleRuntimePolicy({ bundle: bundleA, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
    const resultB = compileBundleRuntimePolicy({ bundle: bundleB, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;

    const p1A = resultA.productPolicies.find((p) => p.productId === PRODUCT_1_ID)!;
    const p1B = resultB.productPolicies.find((p) => p.productId === PRODUCT_1_ID)!;

    // Each has exactly one policy (its own bundle), not both
    expect(p1A.metafield.policies).toHaveLength(1);
    expect(p1A.metafield.policies[0].bundleId).toBe("bundle-A");

    expect(p1B.metafield.policies).toHaveLength(1);
    expect(p1B.metafield.policies[0].bundleId).toBe("bundle-B");
  });
});

describe("canonical step quantity conditions", () => {
  test("compiles both quantity bounds instead of retired min/max columns", () => {
    const bundle = makeBundle();
    Object.assign(bundle.steps[0], { minQuantity: 99, maxQuantity: 99, conditionType: "quantity", conditionOperator: "greater_than_or_equal_to", conditionValue: 2, conditionOperator2: "less_than_or_equal_to", conditionValue2: 5 });
    const result = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
    expect(result.productPolicies[0].metafield.policies[0].groups[0]).toMatchObject({ minQuantity: 2, maxQuantity: 5 });
  });
  test("an unconfigured quantity rule does not inherit retired limits", () => {
    const result = compileBundleRuntimePolicy({ bundle: makeBundle(), parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
    expect(result.productPolicies[0].metafield.policies[0].groups[0]).toMatchObject({ minQuantity: 0, maxQuantity: 2147483647 });
  });
  test("rejects contradictory canonical quantity bounds", () => {
    const bundle = makeBundle();
    Object.assign(bundle.steps[0], { conditionType: "quantity", conditionOperator: "greater_than_or_equal_to", conditionValue: 5, conditionOperator2: "less_than_or_equal_to", conditionValue2: 2 });
    expect(compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID })).toMatchObject({ ok: false, error: "INVALID_CONFIGURATION" });
  });
  test("disabled steps do not publish membership", () => {
    const bundle = makeBundle();
    Object.assign(bundle.steps[0], { enabled: false });
    expect(compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID })).toMatchObject({ ok: false, error: "NO_ELIGIBLE_PRODUCTS" });
  });
});

test("publishes each required default product, not just their total", () => {
  const bundle = makeBundle({ defaultProductsData: { isDefaultProductsEnabled: true, products: [
    { productId: PRODUCT_1_ID, requiredQuantity: 2, variants: [] },
    { productId: PRODUCT_2_ID, requiredQuantity: 1, variants: [] },
  ] } });
  const result = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
  expect(result.productPolicies[0].metafield.policies[0].groups.find(group => group.id === "default-products")).toMatchObject({
    minQuantity: 3, maxQuantity: 3,
    requiredProducts: [{ productId: PRODUCT_1_ID, quantity: 2 }, { productId: PRODUCT_2_ID, quantity: 1 }],
  });
});

test.each([-1, 1.5, NaN, Infinity, "2", undefined, 2147483648])(
  "rejects an invalid required default quantity: %p",
  requiredQuantity => {
    const bundle = makeBundle({ defaultProductsData: { isDefaultProductsEnabled: true, products: [
      { productId: PRODUCT_1_ID, requiredQuantity, variants: [] },
    ] } });
    expect(compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }))
      .toMatchObject({ ok: false, error: "INVALID_CONFIGURATION" });
  },
);

test("rejects overflowing aggregate default quantities", () => {
  const bundle = makeBundle({ defaultProductsData: { isDefaultProductsEnabled: true, products: [
    { productId: PRODUCT_1_ID, requiredQuantity: 2147483647, variants: [] },
    { productId: PRODUCT_2_ID, requiredQuantity: 1, variants: [] },
  ] } });
  expect(compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }))
    .toMatchObject({ ok: false, error: "INVALID_CONFIGURATION" });
});

test("zero required quantity does not create a default requirement", () => {
  const bundle = makeBundle({ defaultProductsData: { isDefaultProductsEnabled: true, products: [
    { productId: PRODUCT_1_ID, requiredQuantity: 0, variants: [] },
  ] } });
  const result = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
  expect(result.productPolicies[0].metafield.policies[0].groups.map(group => group.id)).toEqual(["step-1"]);
});

describe("canonical amount and weight step conditions", () => {
  test.each([ ["amount", 2000, 5000], ["weight", 20, 50] ])(
    "preserves both %s conditions in canonical units", (conditionType, lower, upper) => {
      const bundle = makeBundle();
      Object.assign(bundle.steps[0], { conditionType, conditionOperator: "greater_than_or_equal_to", conditionValue: 20, conditionOperator2: "less_than_or_equal_to", conditionValue2: 50 });
      const result = compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }) as PolicyCompileOk;
      expect(result.productPolicies[0].metafield.policies[0].groups[0]).toMatchObject({ conditions: [
        { type: conditionType, operator: "gte", value: lower },
        { type: conditionType, operator: "lte", value: upper },
      ] });
    },
  );
  test.each([
    { conditionType: "unknown", conditionOperator: "equal_to", conditionValue: 1 },
    { conditionType: "amount", conditionOperator: "unknown", conditionValue: 1 },
    { conditionType: "weight", conditionOperator: "equal_to", conditionValue: -1 },
    { conditionType: "amount", conditionOperator: "equal_to", conditionValue: Infinity },
    { conditionType: "weight", conditionOperator: "equal_to", conditionValue: null },
    { conditionType: "amount", conditionOperator: "greater_than_or_equal_to", conditionValue: 50, conditionOperator2: "less_than_or_equal_to", conditionValue2: 20 },
  ])("rejects a malformed non-quantity rule %p", condition => {
    const bundle = makeBundle();
    Object.assign(bundle.steps[0], condition);
    expect(compileBundleRuntimePolicy({ bundle, parentVariantId: PARENT_VARIANT_ID }))
      .toMatchObject({ ok: false, error: "INVALID_CONFIGURATION" });
  });
});

describe('canonical runtime eligibility', () => {
  test('compiles category rules and product category membership without widening variant selections', () => {
    const bundle = makeBundle();
    const result = compileBundleRuntimePolicy({ parentVariantId: PARENT_VARIANT_ID, bundle: {
      ...bundle, steps: [{ ...bundle.steps[0], conditionType: 'quantity', conditionOperator: 'equal_to', conditionValue: 99,
        StepCategory: [{ id: 'nuts', products: [{ id: PRODUCT_1_ID, variants: [{ id: V1 }] }],
          conditions: [{ type: 'quantity', operator: 'greater_than_or_equal_to', value: 2 },
            { type: 'amount', operator: 'less_than_or_equal_to', value: 40 }] }],
      }],
    }});
    expect(result.ok).toBe(true);
    const policy = (result as PolicyCompileOk).productPolicies[0].metafield.policies[0];
    expect(policy.groups[0]).toMatchObject({ minQuantity: 0, categories: [{ id: 'nuts', conditions: [
      { type: 'quantity', operator: 'gte', value: 2 }, { type: 'amount', operator: 'lte', value: 4000 },
    ] }] });
    expect(policy.memberships[0]).toMatchObject({ categories: [{id: 'nuts', variantSelection: {mode: 'listed_variants', variantIds: [V1]}}], variantSelection: { mode: 'listed_variants', variantIds: [V1, V2, V3] } });
  });

  test('uses canonical subscription enabled and validates allowed plans', () => {
    const result = compileBundleRuntimePolicy({ parentVariantId: PARENT_VARIANT_ID, bundle: makeBundle({
      bundleSubscriptionConfig: { enabled: true, selectedPlanIds: ['gid://shopify/SellingPlan/123'],
        recurringBundleDiscount: true, bundleDiscountAppliesOn: 'subscription', oneTimePurchase: { enabled: false } },
    }) });
    expect(result.ok).toBe(true);
    expect((result as PolicyCompileOk).productPolicies[0].metafield.policies[0]).toMatchObject({
      subscription: { allowedSellingPlanIds: ['gid://shopify/SellingPlan/123'], recurring: true,
        discountAppliesOn: 'subscription', oneTimePurchase: false },
    });
  });

  test('rejects enabled subscriptions without valid Shopify plan IDs', () => {
    const result = compileBundleRuntimePolicy({ parentVariantId: PARENT_VARIANT_ID,
      bundle: makeBundle({ bundleSubscriptionConfig: { enabled: true, selectedPlanIds: ['forged'] } }) });
    expect(result).toMatchObject({ ok: false, error: 'INVALID_CONFIGURATION' });
  });
});

test('publishes add-on tier eligibility and tier-specific product selections', () => {
  const bundle = makeBundle();
  const result = compileBundleRuntimePolicy({ parentVariantId: PARENT_VARIANT_ID, bundle: { ...bundle,
    steps: [...bundle.steps, { id: 'extras', isFreeGift: true, addonDisplayFree: false, StepProduct: [],
      addonTiers: [{ tierId: 'two', eligibilityCondition: { type: 'QUANTITY', value: 2 }, discount: { type: 'PERCENTAGE', value: 20 },
        selectedAddonProducts: [{ id: PRODUCT_3_ID, variants: [{ id: V3 }] }] }] }],
  } });
  expect(result.ok).toBe(true);
  const policy = (result as PolicyCompileOk).productPolicies.find(product => product.productId === PRODUCT_3_ID)!.metafield.policies[0];
  expect(policy.groups.find(group => group.id === 'extras')).toMatchObject({ role: 'addon', tiers: [{ id: 'two',
    condition: { type: 'quantity', operator: 'gte', value: 2 }, percentage: 20 }] });
  expect(policy.memberships.find(member => member.groupId === 'extras')).toMatchObject({
    tiers: [{ id: 'two', variantSelection: { mode: 'listed_variants', variantIds: [V3] } }],
  });
});

test('compiles the canonical FPB personalization add-on group', () => {
  const result = compileBundleRuntimePolicy({ parentVariantId: PARENT_VARIANT_ID, bundle: makeBundle({
    bundleType: 'full_page', personalizationData: { isPersonalizationEnabled: true,
      addonProducts: { isEnabled: true, tiers: [{ tierId: 'extra', maxQuantity: 1,
        eligibilityCondition: { type: 'QUANTITY', value: 2 }, discount: { type: 'PERCENTAGE', value: 10 },
        selectedAddonProducts: [{ id: 'gid://shopify/Product/4', variants: [{ id: 'gid://shopify/ProductVariant/40' }] }] }] } },
  }) });
  expect(result.ok).toBe(true);
  expect((result as PolicyCompileOk).productPolicies.find(product => product.productId.endsWith('/4'))?.metafield.policies[0].groups)
    .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'personalization-addons', role: 'addon' })]));
});


test("publishes the selected add-on tier quantity ceiling", () => {
  const bundle = makeBundle();
  const result = compileBundleRuntimePolicy({ parentVariantId: PARENT_VARIANT_ID,
    bundle: { ...bundle, steps: [...bundle.steps, { id: "extras", isFreeGift: true,
      StepProduct: [{ productId: PRODUCT_1_ID }], addonTiers: [{ tierId: "extra", maxQuantity: 2,
        eligibilityCondition: { type: "QUANTITY", value: 2 }, discount: { type: "PERCENTAGE", value: 20 } }] }] } });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.productPolicies[0].metafield.policies[0].groups.find(group => group.id === "extras")?.tiers?.[0]).toMatchObject({maxQuantity: 2});
});


test("rejects an invalid publication schedule", () => {
  expect(compileBundleRuntimePolicy({ parentVariantId: PARENT_VARIANT_ID,
    bundle: makeBundle({offerPolicy: {scheduleMode: "one_time", startsAt: "invalid", endsAt: "invalid"}}) }))
    .toMatchObject({ok: false, error: "INVALID_CONFIGURATION"});
});


test("retains separate variant allowlists for categories on the same product", () => {
  const bundle = makeBundle();
  const result = compileBundleRuntimePolicy({parentVariantId: PARENT_VARIANT_ID, bundle: {...bundle,
    steps: [{...bundle.steps[0], StepCategory: [{id: "restricted", conditions: [{type: "quantity", condition: "greaterThanOrEqualTo", value: "1"}],
      products: [{productId: PRODUCT_1_ID, variants: [{id: V1}]}]}]}]}});
  expect(result.ok).toBe(true);
  if(result.ok) expect(result.productPolicies[0].metafield.policies[0].memberships[0].categories).toEqual([
    {id: "restricted", variantSelection: {mode: "listed_variants", variantIds: [V1]}}
  ]);
});

test('publishes the configured per-product quantity ceiling for shopper selections', () => {
  const result = compileBundleRuntimePolicy({parentVariantId: PARENT_VARIANT_ID,
    bundle: makeBundle({validateQuantityPerProduct:{isEnabled:true,allowedQuantity:2}})});
  expect(result.ok).toBe(true);
  if (result.ok) for (const product of result.productPolicies) expect(product.metafield.policies[0].memberships[0].maxQuantity).toBe(2);
});
