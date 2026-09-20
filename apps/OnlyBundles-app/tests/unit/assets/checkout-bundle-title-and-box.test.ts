import { buildProductPageCartFormData } from '../../../app/assets/widgets/shared/engine/cart-submit';
import { buildCartItems } from '../../../app/assets/sdk/cart';

describe('Checkout Bundle Title and Box Property Cleanup', () => {
  describe('ProductPageCartMethods.buildProductPageCartFormData', () => {
    it('does not append a public Box property to form data items', () => {
      const cartItems = [
        {
          id: 12345,
          quantity: 1,
          properties: {
            _uniqueWpbItemKey: '12345_step1',
          },
        },
        {
          id: 67890,
          quantity: 2,
          properties: {
            _uniqueWpbItemKey: '67890_step2',
          },
        },
      ];

      const { formData } = buildProductPageCartFormData(cartItems, {
        bundleName: 'My Awesome Bundle',
        offerId: 'OFFER_123',
        sessionKey: 'SESS_456',
      });

      const entries: [string, FormDataEntryValue][] = Array.from((formData as any).entries());
      const boxKeys = entries.filter(([key]) => key.includes('[properties][Box]'));

      expect(boxKeys).toHaveLength(0);
    });
  });

  describe('SDK buildCartItems', () => {
    it('does not append a public Box property to item properties', () => {
      const state = {
        bundleId: 'bundle_1',
        bundleData: { runtimePolicyRevision: 'published-revision' },
        bundleName: 'Test Bundle',
        offerId: 'offer_1',
        steps: [{ id: 'step_1', name: 'Step 1' }],
        selections: {
          step_1: { '48720141091075': 1 },
        },
        stepProductData: [
          [
            {
              id: 'prod_1',
              title: 'Product 1',
              variants: [{ id: '48720141091075', price: '10.00', available: true }],
            },
          ],
        ],
      };

      const result = buildCartItems(state);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].properties).not.toHaveProperty('Box');
    });
  });

});
