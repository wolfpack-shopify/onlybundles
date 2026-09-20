export {};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fullPageProductCardFooterMethods } = require('../../../app/assets/widgets/full-page/methods/product-card-footer-methods.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProductPageInpageRenderMethods } = require('../../../app/assets/widgets/product-page/methods/inpage-render-methods.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProductPageModalMethods } = require('../../../app/assets/widgets/product-page/methods/modal-methods.js');

describe('Universal Out-of-Stock Badge and CTA Blocking Across Templates', () => {
  describe('FPB Presets', () => {
    const presets = ['STANDARD', 'CLASSIC', 'COMPACT', 'HORIZONTAL'];

    presets.forEach((preset) => {
      it(`renders out-of-stock badge and disables Add CTA in FPB preset: ${preset}`, () => {
        const previousDocument = global.document;
        const runtimeDocument = new JSDOM('<!doctype html><html><body></body></html>').window.document;
        global.document = runtimeDocument;

        try {
          const updateSelectionSpy = jest.fn();
          const context = {
            selectedProducts: [{}],
            selectedBundle: {
              variantSelectorEnabled: false,
              steps: [{}],
            },
            getFullPageDesignPreset: () => preset,
            buildPaidAddonProductDisplayData: (product: unknown) => product,
            isVariantOutOfStock: () => true,
            getProductCardAddButtonText: () => '+',
            applyStandardExpandedVariantTitle: () => undefined,
            attachProductCardListeners: fullPageProductCardFooterMethods.attachProductCardListeners,
            updateProductSelection: updateSelectionSpy,
          };

          const card = fullPageProductCardFooterMethods.createProductCard.call(
            context,
            {
              id: 'variant-oos',
              selectionId: 'variant-oos',
              title: `Sold Out ${preset} Product`,
              price: 1500,
              imageUrl: 'https://cdn.example.test/oos.jpg',
              available: false,
            },
            0,
          );

          // Card must be marked out of stock
          expect(card.classList.contains('is-out-of-stock')).toBe(true);

          // Verify out-of-stock badge is NOT rendered (removed to prevent clipping)
          const badge = card.querySelector('.product-stock-badge--out');
          expect(badge).toBeNull();

          // Verify Add button is marked disabled and shows out of stock label
          const addBtn = card.querySelector('.product-add-btn') as HTMLButtonElement | null;
          expect(addBtn).not.toBeNull();
          expect(addBtn?.disabled).toBe(true);
          expect(addBtn?.getAttribute('aria-disabled')).toBe('true');
          expect(addBtn?.textContent?.trim()).toBe('Out of stock');

          // Verify clicking the disabled add button does NOT call updateProductSelection
          addBtn?.dispatchEvent(new runtimeDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
          expect(updateSelectionSpy).not.toHaveBeenCalled();
        } finally {
          global.document = previousDocument;
        }
      });
    });

    it('renders configured outOfStockText copy on button when provided via _resolveText', () => {
      const previousDocument = global.document;
      const runtimeDocument = new JSDOM('<!doctype html><html><body></body></html>').window.document;
      global.document = runtimeDocument;

      try {
        const card = fullPageProductCardFooterMethods.createProductCard.call(
          {
            selectedProducts: [{}],
            selectedBundle: {
              variantSelectorEnabled: false,
              steps: [{}],
            },
            getFullPageDesignPreset: () => 'STANDARD',
            buildPaidAddonProductDisplayData: (product: unknown) => product,
            isVariantOutOfStock: () => true,
            getProductCardAddButtonText: () => '+',
            applyStandardExpandedVariantTitle: () => undefined,
            attachProductCardListeners: () => undefined,
            _resolveText: (key: string, fallback: string) => (key === 'outOfStockText' ? 'Sold Out Today' : fallback),
          },
          {
            id: 'variant-oos-custom',
            selectionId: 'variant-oos-custom',
            title: 'Sold Out Custom',
            price: 1500,
            imageUrl: 'https://cdn.example.test/oos.jpg',
            available: false,
          },
          0,
        );

        const badge = card.querySelector('.product-stock-badge--out');
        expect(badge).toBeNull();

        const addBtn = card.querySelector('.product-add-btn') as HTMLButtonElement | null;
        expect(addBtn?.textContent?.trim()).toBe('Sold Out Today');
      } finally {
        global.document = previousDocument;
      }
    });
  });

  describe('PPB Templates', () => {
    it('renders out-of-stock badge and disables Add button in PPB Cascade layout', () => {
      const previousDocument = global.document;
      const runtimeDocument = new JSDOM('<!doctype html><html><body></body></html>').window.document;
      global.document = runtimeDocument;

      try {
        const target = runtimeDocument.createElement('div');
        const context = {
          _isProductPageCascadeTemplate: () => true,
          _isProductPageGridTemplate: () => false,
          _filterProductsForInpageCategory: (_step: any, prods: any) => prods,
          _resolveText: (_key: string, fallback: string) => fallback,
          renderInlineCardVariantSelector: () => null,
          getSelectedQuantity: () => 0,
          getVariantAvailable: () => ({ available: 0, outOfStock: true }),
          attachProductEventHandlers: () => undefined,
          stepProductData: {
            0: [{
              id: 'p1',
              selectionId: 'v1',
              title: 'Cascade Sold Out Item',
              price: 2500,
              available: false,
            }],
          },
          selectedBundle: {
            steps: [{
              products: [{
                id: 'p1',
                selectionId: 'v1',
                title: 'Cascade Sold Out Item',
                price: 2500,
                available: false,
              }],
            }],
          },
        };

        ProductPageInpageRenderMethods._renderInpageStepProducts.call(
          context,
          0,
          target,
        );

        const card = target.querySelector('.product-card') as HTMLElement;
        expect(card).not.toBeNull();
        expect(card.classList.contains('is-out-of-stock')).toBe(true);

        const badge = card.querySelector('.product-image .product-stock-badge--out');
        expect(badge).toBeNull();

        const addBtn = card.querySelector('.product-add-btn') as HTMLButtonElement | null;
        expect(addBtn).not.toBeNull();
        expect(addBtn?.disabled).toBe(true);
        expect(addBtn?.getAttribute('aria-disabled')).toBe('true');
        expect(addBtn?.textContent?.trim()).toBe('Out of Stock');
      } finally {
        global.document = previousDocument;
      }
    });

    it('renders out-of-stock badge and disables Add button in PPB Grid layout', () => {
      const previousDocument = global.document;
      const runtimeDocument = new JSDOM('<!doctype html><html><body></body></html>').window.document;
      global.document = runtimeDocument;

      try {
        const target = runtimeDocument.createElement('div');
        const context = {
          _isProductPageCascadeTemplate: () => false,
          _isProductPageGridTemplate: () => true,
          _filterProductsForInpageCategory: (_step: any, prods: any) => prods,
          _resolveText: (_key: string, fallback: string) => fallback,
          renderInlineCardVariantSelector: () => null,
          normalizeSelectionKey: (k: any) => String(k),
          getSelectedQuantity: () => 0,
          getVariantAvailable: () => ({ available: 0, outOfStock: true }),
          attachProductEventHandlers: () => undefined,
          stepProductData: {
            0: [{
              id: 'p2',
              selectionId: 'v2',
              title: 'Grid Sold Out Item',
              price: 3500,
              available: false,
            }],
          },
          selectedBundle: {
            steps: [{
              products: [{
                id: 'p2',
                selectionId: 'v2',
                title: 'Grid Sold Out Item',
                price: 3500,
                available: false,
              }],
            }],
          },
        };

        ProductPageInpageRenderMethods._renderInpageStepProducts.call(
          context,
          0,
          target,
        );

        const card = target.querySelector('.product-card') as HTMLElement;
        expect(card).not.toBeNull();
        expect(card.classList.contains('is-out-of-stock')).toBe(true);

        const badge = card.querySelector('.product-image .product-stock-badge--out');
        expect(badge).toBeNull();

        const addBtn = card.querySelector('.product-add-btn') as HTMLButtonElement | null;
        expect(addBtn).not.toBeNull();
        expect(addBtn?.disabled).toBe(true);
        expect(addBtn?.getAttribute('aria-disabled')).toBe('true');
        expect(addBtn?.textContent?.trim()).toBe('Out of Stock');
      } finally {
        global.document = previousDocument;
      }
    });

    it('renders out-of-stock badge and disables Add button in PPB Modal layout', () => {
      const previousDocument = global.document;
      const runtimeDocument = new JSDOM('<!doctype html><html><body><div id="bundle-builder-modal"><div class="product-grid"></div></div></body></html>').window.document;
      global.document = runtimeDocument;

      try {
        const modalEl = runtimeDocument.getElementById('bundle-builder-modal');
        const context = {
          _resolveText: (_key: string, fallback: string) => fallback,
          _filterProductsForInpageCategory: (_step: any, prods: any) => prods,
          getSelectedQuantity: () => 0,
          getVariantAvailable: () => ({ available: 0, outOfStock: true }),
          attachProductEventHandlers: () => undefined,
          renderVariantSelector: () => null,
          selectedProducts: [{}],
          elements: { modal: modalEl },
          stepProductData: {
            0: [{
              id: 'p3',
              selectionId: 'v3',
              title: 'Modal Sold Out Item',
              price: 4500,
              available: false,
            }],
          },
          selectedBundle: {
            steps: [{
              products: [{
                id: 'p3',
                selectionId: 'v3',
                title: 'Modal Sold Out Item',
                price: 4500,
                available: false,
              }],
            }],
          },
        };

        ProductPageModalMethods.renderModalProducts.call(context, 0);

        const card = runtimeDocument.querySelector('#bundle-builder-modal .product-card') as HTMLElement;
        expect(card).not.toBeNull();
        expect(card.classList.contains('is-out-of-stock')).toBe(true);

        const badge = card.querySelector('.product-image .product-stock-badge--out');
        expect(badge).toBeNull();

        const addBtn = card.querySelector('.product-add-btn') as HTMLButtonElement | null;
        expect(addBtn).not.toBeNull();
        expect(addBtn?.disabled).toBe(true);
        expect(addBtn?.getAttribute('aria-disabled')).toBe('true');
        expect(addBtn?.textContent?.trim()).toBe('Out of Stock');
      } finally {
        global.document = previousDocument;
      }
    });
  });
});
