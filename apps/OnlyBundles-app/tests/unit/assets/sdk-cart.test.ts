/**
 * Unit Tests — SDK cart module (buildCartItems)
 */

export {};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  buildCartItems,
  buildBundleDetailsDisplayProperties,
  addBundleToCart,
} = require('../../../app/assets/sdk/cart.js');

function makeState(overrides: object = {}) {
  return {
    bundleId: 'bundle_1',
    offerId: 'MIX-894502',
    bundleName: 'Test Bundle',
    isReady: true,
    bundleData: { runtimePolicyRevision: 'published-revision' },
    steps: [
      { id: 'step_1', isFreeGift: false, isDefault: false },
      { id: 'step_2', isFreeGift: true, isDefault: false },
    ],
    selections: {
      step_1: { '123456': 2 },
      step_2: { '789012': 1 },
    },
    stepProductData: [
      [{ variantId: '123456', title: 'Product A', price: 1000, available: true }],
      [{ variantId: '789012', title: 'Product B (Gift)', price: 500, available: true }],
    ],
    formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
    ...overrides,
  };
}

describe('buildCartItems', () => {
  it('produces product-page cart selection properties', () => {
    const state = makeState();
    const { items } = buildCartItems(state);
    expect(items).toHaveLength(2);

    const itemA = items.find((i: { id: number }) => i.id === 123456);
    expect(itemA).toBeDefined();
    expect(itemA.quantity).toBe(2);
    expect(itemA.properties).not.toHaveProperty('Box');
    expect(itemA.properties._bundleName).toBe('Test Bundle');
    expect(itemA.properties['_wolfpackProductBundle:OfferId']).toMatch(/^MIX-894502_[A-Z0-9]{12}_1$/);
    expect(itemA.properties['_wolfpackProductBundle:prodQty']).toBe('2');
    expect(itemA.properties).not.toHaveProperty('_bundle_id');
    expect(itemA.properties).not.toHaveProperty('_bundle_name');
    expect(itemA.properties).not.toHaveProperty('_step_index');
  });

  it('carries the public offer decision marker in private Shopify line properties', () => {
    const state = makeState({
      bundleData: {
        runtimePolicyRevision: 'published-revision',
        offerDelivery: {
          offerPolicyId: 'policy-1',
          ruleVersion: 4,
          eligibilitySource: 'priority',
        },
      },
    });
    const { sourceProperties } = buildCartItems(state);

    expect(JSON.parse(sourceProperties._bundle_display_properties).offerAnalytics).toEqual({
      bundleId: 'bundle_1',
      offerPolicyId: 'policy-1',
      offerRuleVersion: 4,
      offerEligibilitySource: 'priority',
    });
  });

  it('all items in one call share the same offer-session key with unique item indexes', () => {
    const state = makeState();
    const { items } = buildCartItems(state);
    const offerIds = items.map((i: { properties: { '_wolfpackProductBundle:OfferId': string } }) => i.properties['_wolfpackProductBundle:OfferId']);
    const bases = offerIds.map((value: string) => value.replace(/_[0-9]+$/, ''));
    expect(new Set(bases).size).toBe(1);
    expect(offerIds).toEqual([
      `${bases[0]}_1`,
      `${bases[0]}_2`,
    ]);
  });

  it('tags free gift steps with _bundle_step_type = free_gift', () => {
    const state = makeState();
    const { items } = buildCartItems(state);
    const giftItem = items.find((i: { id: number }) => i.id === 789012);
    expect(giftItem.properties['_bundle_step_type']).toBe('free_gift');
  });

  it('skips unavailable products and reports them', () => {
    const state = makeState({
      stepProductData: [
        [{ variantId: '123456', title: 'Product A', price: 1000, available: false }],
        [{ variantId: '789012', title: 'Product B (Gift)', price: 500, available: true }],
      ],
    });
    expect(() => buildCartItems(state)).toThrow(/unavailable/i);
  });

  it('returns empty items array when no selections', () => {
    const state = makeState({ selections: { step_1: {}, step_2: {} } });
    const { items } = buildCartItems(state);
    expect(items).toHaveLength(0);
  });

  it('prefixes numeric product-page offers with MIX-', () => {
    const state = makeState({ offerId: '894502' });
    const { items } = buildCartItems(state);
    expect(items[0].properties['_wolfpackProductBundle:OfferId']).toMatch(/^MIX-894502_[A-Z0-9]{12}_1$/);
  });

  it('adds preformatted private source properties for cart-line messaging', () => {
    const state = makeState({
      discountAmount: 500,
      discountPercentage: 25,
    });
    const { items, sourceProperties } = buildCartItems(state);

    expect(items[0].properties).not.toHaveProperty('_bundle_box');
    expect(items[0].properties).not.toHaveProperty('_bundle_items');
    expect(items[0].properties).not.toHaveProperty('_bundle_retail_price');
    expect(items[0].properties).not.toHaveProperty('_bundle_you_save');
    expect(items[0].properties).not.toHaveProperty('_bundle_you_save_amount');
    expect(items[0].properties).not.toHaveProperty('_bundle_you_save_percentage');

    expect(items[0].properties).toHaveProperty('_bundle_display_properties');
    const displayProperties = JSON.parse(sourceProperties['_bundle_display_properties']);
    expect(displayProperties).toEqual({
      box: '1',
      bundleName: 'Test Bundle',
      items: '2 x Product A, 1 x Product B (Gift)',
      retailPrice: '$20.00',
      offerAnalytics: {
        bundleId: 'bundle_1',
      },
      youSave: {
        amount: '$5.00',
        percentage: '25%',
        amountPercentage: '$5.00 (25%)',
      },
    });
  });

  it('builds bundle_details display properties from SDK source metadata', () => {
    const state = makeState({
      discountAmount: 500,
      discountPercentage: 25,
    });
    const { sourceProperties } = buildCartItems(state);

    expect(buildBundleDetailsDisplayProperties(sourceProperties)).toEqual({
      Box: '1',
      Items: '2 x Product A, 1 x Product B (Gift)',
      'Retail Price': '$20.00',
      'You Save': '$5.00 (25%)',
    });
  });
});

describe('addBundleToCart', () => {
  const installShopifyActions = (updateCart: jest.Mock) => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { Shopify: { actions: { updateCart } } },
    });
  };

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as any).window;
  });

  it('submits clean Shopify component lines through the native cart action', async () => {
    const updateCart = jest.fn().mockResolvedValue({ cart: { id: 'cart-1' }, userErrors: [], warnings: [] });
    installShopifyActions(updateCart);
    const emit = jest.fn();

    await addBundleToCart(makeState(), () => ({ valid: true, errors: {} }), emit);

    const body = updateCart.mock.calls[0][0];
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({
      merchandiseId: 'gid://shopify/ProductVariant/123456',
      quantity: 2,
    });
    expect(body.lines[0].attributes).toEqual(expect.arrayContaining([
      { key: '_bundleName', value: 'Test Bundle' },
      { key: '_wolfpackProductBundle:prodQty', value: '2' },
    ]));
    expect(body.lines[1]).toMatchObject({
      merchandiseId: 'gid://shopify/ProductVariant/789012',
      quantity: 1,
    });
    expect(body.lines[1].attributes).toContainEqual({ key: '_bundle_step_type', value: 'free_gift' });
    expect(emit).toHaveBeenCalledWith('wbp:cart-success', { bundleId: 'bundle_1', warnings: [] });
  });

  it('does not invoke any Ajax cart or app-proxy authorization endpoint', async () => {
    const updateCart = jest.fn().mockResolvedValue({ cart: {}, userErrors: [], warnings: [] });
    installShopifyActions(updateCart);
    global.fetch = jest.fn();
    const emit = jest.fn();

    await addBundleToCart(makeState(), () => ({ valid: true, errors: {} }), emit);

    expect(updateCart).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('emits wbp:cart-failed when Shopify returns a user error', async () => {
    installShopifyActions(jest.fn().mockResolvedValue({
      cart: null,
      userErrors: [{ message: 'Product is sold out' }],
      warnings: [],
    }));
    const emit = jest.fn();

    await addBundleToCart(makeState(), () => ({ valid: true, errors: {} }), emit);

    expect(emit).toHaveBeenCalledWith('wbp:cart-failed', { error: 'Product is sold out' });
  });

  it('emits wbp:cart-failed without network calls when bundle validation fails', async () => {
    global.fetch = jest.fn();
    const emit = jest.fn();

    await addBundleToCart(makeState(), () => ({ valid: false, errors: { step_1: 'Select a product' } }), emit);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('wbp:cart-failed', {
      error: 'Bundle validation failed. Complete all required steps.',
    });
  });
});


test('SDK submits published selection identifiers without minting authorization', () => {
  const { items } = buildCartItems(makeState());
  const selected = JSON.parse(items[0].properties._wpb_selection);
  expect(selected).toMatchObject({ bundleId: 'bundle_1', revision: 'published-revision', groupId: 'step_1' });
  expect(items[0].properties).not.toHaveProperty('_wolfpack_bundle_runtime');
});
