import { JSDOM } from 'jsdom';
import {
  calculateCartTierProgress,
  renderCartTierProgressBar,
  type CartTierProgressState,
} from '../../../app/storefront/cart-tier-progress-bar';

describe('Cart Tier Progress Bar', () => {
  describe('calculateCartTierProgress', () => {
    const sampleTierRules = [
      { conditionType: 'quantity', minQuantity: 3, discountType: 'percentage', discountValue: 10 },
      { conditionType: 'quantity', minQuantity: 4, discountType: 'percentage', discountValue: 15 },
      { conditionType: 'quantity', minQuantity: 5, discountType: 'percentage', discountValue: 20 },
    ];

    it('returns null when cart has no items', () => {
      const result = calculateCartTierProgress([]);
      expect(result).toBeNull();
    });

    it('returns null when cart has items without bundle tier progress metadata', () => {
      const cartItems = [
        { id: 12345, quantity: 2, properties: { Size: 'M' }, price: 2000 },
      ];
      const result = calculateCartTierProgress(cartItems);
      expect(result).toBeNull();
    });

    it('calculates progress accurately when below first tier', () => {
      const cartItems = [
        {
          id: 12345,
          quantity: 2,
          price: 2000,
          properties: {
            _bundle_display_properties: JSON.stringify({
              items: '2 x Shirt',
              tierProgress: {
                rules: sampleTierRules,
                progressBar: { enabled: true },
              },
            }),
          },
        },
      ];

      const result = calculateCartTierProgress(cartItems);
      expect(result).not.toBeNull();
      expect(result?.progressPercent).toBe(67);
      expect(result?.message).toBe('Add 1 more to unlock 10% off!');
      expect(result?.isMaxTier).toBe(false);
    });

    it('calculates progress accurately when between intermediate tiers', () => {
      const cartItems = [
        {
          id: 12345,
          quantity: 3,
          price: 2000,
          properties: {
            _bundle_display_properties: JSON.stringify({
              items: '3 x Shirt',
              tierProgress: {
                rules: sampleTierRules,
                progressBar: { enabled: true },
              },
            }),
          },
        },
      ];

      const result = calculateCartTierProgress(cartItems);
      expect(result).not.toBeNull();
      expect(result?.progressPercent).toBe(75);
      expect(result?.message).toBe('10% unlocked! Add 1 more to unlock 15% off!');
      expect(result?.isMaxTier).toBe(false);
    });

    it('shows completion message and 100% progress when max tier is reached', () => {
      const cartItems = [
        {
          id: 12345,
          quantity: 5,
          price: 2000,
          properties: {
            _bundle_display_properties: JSON.stringify({
              items: '5 x Shirt',
              tierProgress: {
                rules: sampleTierRules,
                progressBar: { enabled: true },
              },
            }),
          },
        },
      ];

      const result = calculateCartTierProgress(cartItems);
      expect(result).not.toBeNull();
      expect(result?.progressPercent).toBe(100);
      expect(result?.message).toBe("You've unlocked 20% off!");
      expect(result?.isMaxTier).toBe(true);
    });

    it('supports subtotal / amount-based rules', () => {
      const amountRules = [
        { conditionType: 'amount', minSubtotal: 5000, discountType: 'percentage', discountValue: 10 },
        { conditionType: 'amount', minSubtotal: 10000, discountType: 'percentage', discountValue: 20 },
      ];

      const cartItems = [
        {
          id: 12345,
          quantity: 1,
          line_price: 3500,
          price: 3500,
          properties: {
            _bundle_display_properties: JSON.stringify({
              items: '1 x Premium Item',
              tierProgress: {
                rules: amountRules,
                progressBar: { enabled: true },
              },
            }),
          },
        },
      ];

      const result = calculateCartTierProgress(cartItems, '$');
      expect(result).not.toBeNull();
      expect(result?.progressPercent).toBe(70);
      expect(result?.message).toBe('Add $15.00 to unlock 10% off!');
    });

    it('extracts tier progress from _wolfpack_bundle_runtime when present on cart parent item', () => {
      const payload = {
        version: 2,
        bundleId: 'bundle-test',
        priceAdjustment: {
          method: 'percentage_off',
          value: 10,
          rules: [
            { method: 'percentage_off', value: 10, conditions: { type: 'quantity', operator: 'gte', value: 2 } },
            { method: 'percentage_off', value: 15, conditions: { type: 'quantity', operator: 'gte', value: 3 } },
          ],
        },
      };
      const token = `${Buffer.from(JSON.stringify(payload)).toString('base64')}.mock_sig`;
      const cartItems = [
        {
          id: 12345,
          quantity: 1,
          price: 2000,
          properties: {
            _wolfpack_bundle_runtime: token,
          },
        },
      ];

      const result = calculateCartTierProgress(cartItems);
      expect(result).not.toBeNull();
      expect(result?.progressPercent).toBe(50);
      expect(result?.message).toBe('Add 1 more to unlock 10% off!');
      expect(result?.isMaxTier).toBe(false);
    });
  });

  describe('renderCartTierProgressBar', () => {
    let dom: JSDOM;
    let document: Document;

    beforeEach(() => {
      dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <cart-drawer>
              <div class="drawer__header">
                <h2>Your Cart</h2>
              </div>
              <div class="cart-drawer-items"></div>
            </cart-drawer>
          </body>
        </html>
      `);
      document = dom.window.document;
    });

    it('mounts into cart drawer and renders progress and message', () => {
      const state: CartTierProgressState = {
        progressPercent: 67,
        message: 'Add 1 more to unlock 10% off!',
        isMaxTier: false,
      };

      renderCartTierProgressBar(document, state);

      const el = document.querySelector('.wpb-cart-tier-progress-bar');
      expect(el).not.toBeNull();
      expect(el?.textContent).toContain('Add 1 more to unlock 10% off!');

      const fill = el?.querySelector('.wpb-cart-tier-progress-bar__fill') as HTMLElement;
      expect(fill?.style.width).toBe('67%');
    });

    it('removes progress bar element when state is null', () => {
      const state: CartTierProgressState = {
        progressPercent: 100,
        message: "You've unlocked 20% off!",
        isMaxTier: true,
      };

      renderCartTierProgressBar(document, state);
      expect(document.querySelector('.wpb-cart-tier-progress-bar')).not.toBeNull();

      renderCartTierProgressBar(document, null);
      expect(document.querySelector('.wpb-cart-tier-progress-bar')).toBeNull();
    });
  });
});
