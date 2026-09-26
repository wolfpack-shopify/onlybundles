export {};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getInlineVariantSelectorPresentation } = require('../../../app/assets/widgets/shared/variant-selector-policy.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VariantSelectorComponent } = require('../../../app/assets/widgets/shared/variant-selector.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fullPageProductCardFooterMethods } = require('../../../app/assets/widgets/full-page/methods/product-card-footer-methods.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');

describe('FPB Horizontal grouped variant selector', () => {
  const product = {
    id: 'product-1',
    title: 'Fragrance Candle',
    variantId: 'variant-cherry',
    selectionId: 'variant-cherry',
    options: ['Scent'],
    variants: [
      { id: 'variant-cherry', selectionId: 'variant-cherry', title: 'Cherry', option1: 'Cherry', price: 3000, available: true },
      { id: 'variant-vanilla', selectionId: 'variant-vanilla', title: 'Vanilla', option1: 'Vanilla', price: 3000, available: true },
      { id: 'variant-peach', selectionId: 'variant-peach', title: 'Peach', option1: 'Peach', price: 3000, available: false },
    ],
  };

  it('uses a dropdown with inline mobile behavior only for Horizontal', () => {
    expect(getInlineVariantSelectorPresentation('HORIZONTAL')).toEqual({
      type: 'dropdown',
      mobileMode: 'inline',
    });
    expect(getInlineVariantSelectorPresentation('STANDARD')).toEqual({
      type: 'dropdown',
      mobileMode: 'inline',
    });
    expect(getInlineVariantSelectorPresentation('CLASSIC')).toEqual({
      type: 'dropdown',
      mobileMode: 'inline',
    });
    expect(getInlineVariantSelectorPresentation('COMPACT')).toEqual({
      type: 'buttons',
      mobileMode: 'inline',
    });
  });

  it('renders a native inline dropdown with a blank placeholder and every value', () => {
    const runtimeDocument = new JSDOM('<!doctype html><html><body></body></html>').window.document;
    const view = VariantSelectorComponent.createDropdownElement(product, 'Scent', {
      placeholder: 'Cherry',
      mobileMode: 'inline',
      hideUnavailable: true,
      document: runtimeDocument,
    });

    const select = view.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '', 'Cherry', 'Vanilla', 'Peach',
    ]);
    expect(Array.from(select.options).find((option) => option.value === 'Peach')?.disabled).toBe(false);
  });

  it.each(['STANDARD', 'CLASSIC', 'COMPACT', 'HORIZONTAL'])(
    'retains unavailable grouped variants as selectable in %s cards',
    (designPreset) => {
      const originalDocument = (global as { document?: unknown }).document;
      const runtimeDocument = new JSDOM('<!doctype html><html><body></body></html>').window.document;
      (global as { document?: unknown }).document = runtimeDocument;

      try {
        const card = fullPageProductCardFooterMethods.createProductCard.call(
          {
            selectedProducts: [{}],
            selectedBundle: {
              variantSelectorEnabled: true,
              showProductComparedAtPrice: false,
              steps: [{ displayVariantsAsIndividualProducts: false }],
            },
            getFullPageDesignPreset: () => designPreset,
            buildPaidAddonProductDisplayData: (value: unknown) => value,
            isVariantOutOfStock: () => false,
            getProductCardAddButtonText: () => 'Add',
            _resolveText: () => 'Choose Options',
            applyStandardExpandedVariantTitle: () => undefined,
            attachProductCardListeners: () => undefined,
          },
          product,
          0,
        ) as HTMLElement;

        if (designPreset === 'COMPACT') {
          expect(card.querySelector('input[value="Cherry"]')).not.toBeNull();
          expect(card.querySelector('input[value="Peach"]')?.hasAttribute('disabled')).toBe(false);
        } else {
          const select = card.querySelector('select') as HTMLSelectElement;
          expect(Array.from(select.options).some((option) => option.value === 'Cherry')).toBe(true);
          expect(Array.from(select.options).find((option) => option.value === 'Peach')?.disabled).toBe(false);
        }
      } finally {
        (global as { document?: unknown }).document = originalDocument;
      }
    },
  );
});
