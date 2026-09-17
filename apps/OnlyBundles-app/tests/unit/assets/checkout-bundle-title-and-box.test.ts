import { buildProductPageCartFormData } from '../../../app/assets/widgets/shared/engine/cart-submit';
import { buildCartItems } from '../../../app/assets/sdk/cart';
import { ProductPageCartMethods } from '../../../app/assets/widgets/product-page/methods/cart-methods';
import { fullPageRuntimeCartSettingsMethods } from '../../../app/assets/widgets/full-page/methods/runtime-cart-settings-methods';

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

  describe('ProductPageCartMethods.buildBundleDetailsDisplayProperties', () => {
    it('preserves bundleName from _bundle_display_properties in cart metafield display properties', () => {
      const sourceProperties = {
        _bundle_display_properties: JSON.stringify({
          bundleName: 'Live Step6 QA Bundle',
          items: '2 items',
          retailPrice: '$1,448.00',
        }),
      };

      const context = {
        config: {},
        getCartLineLabels: ProductPageCartMethods.getCartLineLabels,
      };

      const displayProps = ProductPageCartMethods.buildBundleDetailsDisplayProperties.call(
        context,
        sourceProperties,
      );

      expect(displayProps).toHaveProperty('bundleName', 'Live Step6 QA Bundle');
    });

    it('falls back to sourceProperties._bundleName if present', () => {
      const sourceProperties = {
        _bundleName: 'Fallback Bundle Name',
      };

      const context = {
        config: {},
        getCartLineLabels: ProductPageCartMethods.getCartLineLabels,
      };

      const displayProps = ProductPageCartMethods.buildBundleDetailsDisplayProperties.call(
        context,
        sourceProperties,
      );

      expect(displayProps).toHaveProperty('bundleName', 'Fallback Bundle Name');
    });
  });

  describe('fullPageRuntimeCartSettingsMethods.buildBundleDetailsDisplayProperties', () => {
    it('preserves bundleName in full page cart metafield display properties', () => {
      const sourceProperties = {
        _bundle_display_properties: JSON.stringify({
          bundleName: 'Full Page Summer Bundle',
        }),
      };

      const context = {
        config: {},
        getCartLineLabels: fullPageRuntimeCartSettingsMethods.getCartLineLabels,
      };

      const displayProps = fullPageRuntimeCartSettingsMethods.buildBundleDetailsDisplayProperties.call(
        context,
        sourceProperties,
      );

      expect(displayProps).toHaveProperty('bundleName', 'Full Page Summer Bundle');
    });
  });
});
