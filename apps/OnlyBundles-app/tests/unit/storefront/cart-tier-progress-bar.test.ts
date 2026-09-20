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

    it('extracts published tier presentation metadata from a transformed parent', () => {
      const metadata = { rules: [
        { conditionType: 'quantity', minQuantity: 2, discountType: 'percentage', discountValue: 10 },
        { conditionType: 'quantity', minQuantity: 3, discountType: 'percentage', discountValue: 15 },
      ], progressBar: { enabled: true, type: 'simple' } };
      const cartItems = [
        {
          id: 12345,
          quantity: 1,
          price: 2000,
          properties: {
            _bundle_tier_progress: JSON.stringify(metadata),
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

    it('mounts inside Horizon theme dialog after #cart-drawer-header instead of outer cart-drawer-component', () => {
      const horizonDom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <cart-drawer-component class="cart-drawer">
              <button class="header-actions__action">Cart (1)</button>
              <dialog class="cart-drawer__dialog">
                <div class="cart-drawer__inner">
                  <cart-items-component class="cart-items-component">
                    <div id="cart-drawer-header" class="cart-drawer__header">
                      <h2>Cart</h2>
                    </div>
                    <div class="cart-drawer__content"></div>
                  </cart-items-component>
                </div>
              </dialog>
            </cart-drawer-component>
          </body>
        </html>
      `);
      const horizonDoc = horizonDom.window.document;
      const state: CartTierProgressState = {
        progressPercent: 50,
        message: 'Add 1 more to unlock 10% off!',
        isMaxTier: false,
      };

      renderCartTierProgressBar(horizonDoc, state);

      const bar = horizonDoc.querySelector('.wpb-cart-tier-progress-bar');
      expect(bar).not.toBeNull();
      // Must be inside the dialog after cart-drawer-header
      expect(bar?.parentElement?.tagName).toBe('CART-ITEMS-COMPONENT');
      expect(horizonDoc.getElementById('cart-drawer-header')?.nextElementSibling).toBe(bar);
      // Must NOT be a direct child of cart-drawer-component
      expect(horizonDoc.querySelector('cart-drawer-component > .wpb-cart-tier-progress-bar')).toBeNull();
    });

    it('does not mount on product pages when only a product purchase form is present', () => {
      const pdpDom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div class="product-info">
              <form action="/cart/add" method="post">
                <button type="submit">Add to cart</button>
              </form>
            </div>
          </body>
        </html>
      `);
      const pdpDoc = pdpDom.window.document;
      const state: CartTierProgressState = {
        progressPercent: 50,
        message: 'Add 1 more to unlock 10% off!',
        isMaxTier: false,
      };

      renderCartTierProgressBar(pdpDoc, state);

      expect(pdpDoc.querySelector('.wpb-cart-tier-progress-bar')).toBeNull();
    });

    it('mounts into /cart page container (#main-cart-items)', () => {
      const cartPageDom = new JSDOM(`
        <!DOCTYPE html>
        <html>
          <body>
            <div id="main-cart-items">
              <div class="cart-item"></div>
            </div>
          </body>
        </html>
      `);
      const cartDoc = cartPageDom.window.document;
      const state: CartTierProgressState = {
        progressPercent: 50,
        message: 'Add 1 more to unlock 10% off!',
        isMaxTier: false,
      };

      renderCartTierProgressBar(cartDoc, state);

      const bar = cartDoc.querySelector('#main-cart-items > .wpb-cart-tier-progress-bar');
      expect(bar).not.toBeNull();
    });
  });
});

test('uses the transformed component count for bundle tier progress', () => {
  const result = calculateCartTierProgress([{quantity: 1, price: 4000, line_price: 4000, properties: {
    _bundle_total_quantity: '3', _bundle_total_retail_cents: '6000',
    _bundle_tier_progress: JSON.stringify({rules:[{conditionType:'quantity',minQuantity:3,discountType:'percentage',discountValue:100}],progressBar:{enabled:true}})
  }}]);
  expect(result?.isMaxTier).toBe(true);
});

describe('Cart pricing method messages', () => {
  test.each([
    [{discountType:'fixed_bundle_price',discountValue:3500},'Bundle price: $35.00'],
    [{discountType:'buy_x_get_y',discountValue:100,customerBuys:2,customerGets:1,bxyDiscountType:'percentage'},'Buy 2, get 1 at 100% off'],
  ])('describes the actual offer instead of treating every value as a percentage', (rule,message) => {
    const result=calculateCartTierProgress([{quantity:3,price:2000,properties:{_bundle_tier_progress:JSON.stringify({rules:[{...rule,minQuantity:3}]})}}]);
    expect(result?.message).toBe(message);
  });
});
