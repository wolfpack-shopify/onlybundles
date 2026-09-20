import { fullPageProductProcessingMethods } from '../../../app/assets/widgets/full-page/methods/product-processing-methods';
import { fetchStorefrontProductsUnified } from '../../../app/assets/widgets/shared/storefront-products-fetcher';
jest.mock('../../../app/assets/widgets/shared/storefront-products-fetcher', () => ({ fetchStorefrontProductsUnified: jest.fn() }));

test('records Shopify inventory after hydrating required default products', async () => {
  const previousWindow = global.window;
  Object.assign(global, { window: { Shopify: { country: 'US' } } });
  const products = [{ id: 'gid://shopify/Product/1', variants: [{ id: 'gid://shopify/ProductVariant/2', availableForSale: true }] }];
  jest.mocked(fetchStorefrontProductsUnified).mockResolvedValue(products as never);
  const context = { directDefaultProducts: [{ id: '1', variantId: '2', selectionId: '2', defaultRequiredQuantity: 1 }],
    selectedProducts: [{ '2': 1 }], resolveStorefrontApiBase: () => '/apps/product-bundles-sit', rememberRuntimeProductInventory: jest.fn() };
  try {
    await fullPageProductProcessingMethods._reconcileDirectDefaultProductsFromStorefront.call(context, 0);
    expect(context.rememberRuntimeProductInventory).toHaveBeenCalledWith(products);
    expect(fetchStorefrontProductsUnified).toHaveBeenCalledWith(expect.objectContaining({ productIds: ['gid://shopify/Product/1'] }));
  } finally { Object.assign(global, { window: previousWindow }); }
});
