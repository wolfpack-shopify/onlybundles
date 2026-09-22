import {
  getScheduledBundleIncompatibilities,
} from "../../../app/lib/scheduled-bundle-compatibility";

describe("getScheduledBundleIncompatibilities", () => {
  it.each(["percentage_off", "fixed_amount_off", "fixed_bundle_price"])(
    "allows amount-based %s pricing",
    (discountType) => {
      expect(getScheduledBundleIncompatibilities({
        discountData: {
          discountEnabled: true,
          discountType,
          discountRules: [
            { id: "rule-1", conditionType: "amount", conditionValue: 50, discountValue: 10 },
          ],
        },
      })).toEqual([]);
    },
  );

  it("rejects lowest-priced buy-X-get-Y pricing", () => {
    expect(getScheduledBundleIncompatibilities({
      discountData: {
        discountEnabled: true,
        discountType: "buy_x_get_y",
        discountRules: [{ id: "rule-1", bxyApplyMode: "lowest_priced" }],
      },
    })).toContain("lowest_priced_buy_x_get_y");
  });

  it("rejects multi-tier pricing selected by hidden component quantity", () => {
    expect(getScheduledBundleIncompatibilities({
      discountData: {
        discountEnabled: true,
        discountType: "percentage_off",
        discountRules: [
          { id: "rule-1", conditionType: "quantity", conditionValue: 2, discountValue: 10 },
          { id: "rule-2", conditionType: "quantity", conditionValue: 4, discountValue: 20 },
        ],
      },
    })).toContain("hidden_component_quantity_tier");
  });

  it("rejects a single pricing tier selected by hidden component quantity", () => {
    expect(getScheduledBundleIncompatibilities({
      discountData: {
        discountEnabled: true,
        discountType: "percentage_off",
        discountRules: [
          { id: "rule-1", conditionType: "quantity", conditionValue: 2, discountValue: 10 },
        ],
      },
    })).toContain("hidden_component_quantity_tier");
  });

  it("treats the default buy-X-get-Y target as lowest priced", () => {
    expect(getScheduledBundleIncompatibilities({
      discountData: {
        discountEnabled: true,
        discountType: "buy_x_get_y",
        discountRules: [{ id: "rule-1" }],
      },
    })).toEqual(["lowest_priced_buy_x_get_y"]);
  });

  it("rejects pricing tiers selected by hidden component identity", () => {
    expect(getScheduledBundleIncompatibilities({
      discountData: {
        discountEnabled: true,
        discountType: "percentage_off",
        discountRules: [
          { id: "rule-1", conditionType: "amount", conditionValue: 20, productIds: ["p1"] },
        ],
      },
    })).toContain("hidden_component_identity_tier");
  });

  it("rejects add-on eligibility that depends on hidden component facts", () => {
    expect(getScheduledBundleIncompatibilities({
      addonTiers: [{
        eligibilityCondition: { type: "QUANTITY", value: 3 },
        conditions: [{ type: "weight", condition: "greaterThanOrEqualTo", value: 10 }],
      }],
    })).toContain("addon_hidden_component_dependency");
  });

  it("allows amount-based add-on eligibility", () => {
    expect(getScheduledBundleIncompatibilities({
      addonTiers: [{
        eligibilityCondition: { type: "AMOUNT", value: 50 },
        discount: { type: "PERCENTAGE", value: 10 },
      }],
    })).toEqual([]);
  });

  it("rejects gifts triggered by hidden base variants", () => {
    expect(getScheduledBundleIncompatibilities({
      steps: [{
        isFreeGift: true,
        qualifyingVariantIds: ["gid://shopify/ProductVariant/1"],
      }],
    })).toContain("variant_specific_gift");
  });

  it("rejects rules that allocate savings to individual hidden components", () => {
    expect(getScheduledBundleIncompatibilities({
      discountData: {
        discountEnabled: true,
        discountType: "buy_x_get_y",
        discountRules: [{ id: "rule-1", bxyApplyMode: "latest_added" }],
      },
    })).toContain("per_component_discount_allocation");
  });

  it("returns each reason once", () => {
    expect(getScheduledBundleIncompatibilities({
      discountData: {
        discountEnabled: true,
        discountType: "buy_x_get_y",
        discountRules: [
          { id: "rule-1", bxyApplyMode: "lowest_priced" },
          { id: "rule-2", bxyApplyMode: "lowest_priced" },
        ],
      },
    })).toEqual(["lowest_priced_buy_x_get_y"]);
  });
});
