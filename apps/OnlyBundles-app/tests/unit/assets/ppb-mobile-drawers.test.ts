// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  dispatchProductPageVariantSelection,
} = require('../../../app/assets/widgets/product-page/methods/modal-methods.js');

describe('PPB mobile variant drawer behavior', () => {
  it('routes a mobile choice through the existing PPB variant-change owner', () => {
    const product = { variantId: 'variant-2' };
    const select = { value: '', dispatchEvent: jest.fn() };

    dispatchProductPageVariantSelection({
      product,
      select,
      oldVariantId: 'variant-1',
      newVariantId: 'variant-2',
      createEvent: () => ({ type: 'change' }),
    });

    expect(product.variantId).toBe('variant-1');
    expect(select.value).toBe('variant-2');
    expect(select.dispatchEvent).toHaveBeenCalledWith({ type: 'change' });
  });
});
