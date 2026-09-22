// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  buildBundleSelectionProperties,
  applySellingPlanToJsonCartItems,
  buildOfferAnalyticsCartProperties,
  extractBundleDetailsSourceProperties,
} = require('../../../app/assets/widgets/shared/engine/cart-submit.js');

describe('shared cart-submit helpers', () => {
  it('builds privacy-safe Shopify line properties for offer attribution', () => {
    expect(buildOfferAnalyticsCartProperties({
      sourceProperties: {
        _bundle_display_properties: JSON.stringify({ box: '2', items: '2 x Product A' }),
      },
      bundleId: ' bundle-1 ',
      bundleName: ' Gift Box ',
      offerDelivery: {
        offerPolicyId: ' policy-1 ',
        ruleVersion: 3,
        eligibilitySource: 'specific_link',
      },
      tierId: ' tier-2 ',
    })).toEqual({
      _bundle_display_properties: JSON.stringify({
        box: '2',
        items: '2 x Product A',
        bundleName: 'Gift Box',
        offerAnalytics: {
          bundleId: 'bundle-1',
          offerPolicyId: 'policy-1',
          offerRuleVersion: 3,
          offerTierId: 'tier-2',
          offerEligibilitySource: 'specific_link',
        },
      }),
    });

    expect(buildOfferAnalyticsCartProperties({
      sourceProperties: {
        _bundle_display_properties: JSON.stringify({ box: '1' }),
      },
      bundleId: 'bundle-1',
      offerDelivery: {
        offerPolicyId: 'x'.repeat(129),
        ruleVersion: -1,
        eligibilitySource: 'customer_email',
      },
    })).toEqual({
      _bundle_display_properties: JSON.stringify({
        box: '1',
        offerAnalytics: { bundleId: 'bundle-1' },
      }),
    });
  });

  it('extracts bundle-details source properties from the first cart item with display metadata', () => {
    expect(extractBundleDetailsSourceProperties([
      { properties: { ignored: 'true' } },
      { properties: { _bundle_display_properties: '{"box":"1"}', keep: 'yes' } },
    ])).toEqual({
      _bundle_display_properties: '{"box":"1"}',
      keep: 'yes',
    });
  });

  it('adds one selling plan to every full-page JSON component and omits public Box metadata', () => {
    const original = [
      { id: '101', quantity: 1, properties: { Box: '1', _private: 'keep' } },
      { id: '202', quantity: 2, properties: { Box: '2' } },
    ];

    expect(applySellingPlanToJsonCartItems(
      original,
      'gid://shopify/SellingPlan/55',
    )).toEqual([
      { id: '101', quantity: 1, selling_plan: '55', properties: { _private: 'keep' } },
      { id: '202', quantity: 2, selling_plan: '55', properties: {} },
    ]);
    expect(original[0].properties.Box).toBe('1');
  });
});


test('selection properties contain identifiers only and require a published revision', () => {
  expect(buildBundleSelectionProperties({ bundleId: 'bundle', revision: 'r', instanceId: 'i', groupId: 'g' })).toEqual({
    _wpb_selection: JSON.stringify({ bundleId: 'bundle', revision: 'r', instanceId: 'i', groupId: 'g' }),
  });
  expect(() => buildBundleSelectionProperties({ bundleId: 'bundle', instanceId: 'i', groupId: 'g' })).toThrow();
});
