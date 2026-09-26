// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveSelectedSlotTitle } = require('../../../app/assets/widgets/product-page/methods/inpage-render-methods.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProductPageInpageRenderMethods } = require('../../../app/assets/widgets/product-page/methods/inpage-render-methods.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProductPageSelectionMethods } = require('../../../app/assets/widgets/product-page/methods/selection-methods.js');

describe('SelectedSlotTitle', () => {
  const longTitle = '14k Dangling Obsidian Earrings';

  it('keeps the full title for Vertical Slots', () => {
    expect(resolveSelectedSlotTitle(longTitle, true)).toBe(longTitle);
  });

  it('keeps the full title for CSS-owned clamping in other templates', () => {
    expect(resolveSelectedSlotTitle(longTitle, false)).toBe(longTitle);
  });

  it('keeps short titles unchanged', () => {
    expect(resolveSelectedSlotTitle('Short title', true)).toBe('Short title');
    expect(resolveSelectedSlotTitle('Short title', false)).toBe('Short title');
  });

  it('opens a filled Vertical slot in an explicit one-unit replacement context', () => {
    const originalDocument = global.document;
    global.document = createFakeDocument() as unknown as Document;
    const openModal = jest.fn();

    try {
      const widget: any = {
        selectedBundle: {
          steps: [{ conditionValue: 1, conditionOperator: 'equal_to' }],
        },
        _usesVerticalModalSlotLayout: () => true,
        _isProductPageModalSlotTemplate: () => true,
        openModal,
        removeProductFromSelection: jest.fn(),
      };
      const card = ProductPageInpageRenderMethods.createSelectedProductCard.call(widget, {
        product: { title: longTitle, imageUrl: 'https://cdn.example.test/product.jpg' },
        stepIndex: 0,
        step: {},
        variantId: 'variant-1',
        instanceIndex: 0,
      }, 0);

      const replacementControl = card.children.find((child: any) => (
        child.tagName === 'BUTTON' && child.getAttribute('aria-label') === `Change ${longTitle}`
      ));

      expect(replacementControl).toBeDefined();
      replacementControl.dispatch('click');
      expect(widget._modalSlotReplacementTarget).toEqual({
        stepIndex: 0,
        selectionKey: 'variant-1',
        quantity: 1,
      });
      expect(openModal).toHaveBeenCalledWith(0, replacementControl);
    } finally {
      global.document = originalDocument;
    }
  });

  it('replaces only one unit of the targeted filled-slot selection', () => {
    const selections: Record<string, number> = { 'variant-1': 2, 'variant-2': 1 };
    const setSelectedQuantity = jest.fn((_stepIndex: number, key: string, quantity: number) => {
      selections[key] = quantity;
    });
    const validateStepCondition = jest.fn((_stepIndex: number, key: string, quantity: number) => (
      Object.entries(selections).reduce((total, [selectionKey, selectedQuantity]: any) => (
        total + (selectionKey === key ? 0 : selectedQuantity)
      ), quantity) <= 3
    ));
    const context = {
      selectedProducts: [selections],
      selectedBundle: { steps: [{}] },
      stepProductData: [[{ id: 'variant-2' }]],
      _modalSlotReplacementTarget: { stepIndex: 0, selectionKey: 'variant-1', quantity: 1 },
      normalizeSelectionKey: (value: string) => value,
      _getDirectDefaultRequiredQuantity: () => null,
      getVariantAvailable: () => ({ available: null, outOfStock: false }),
      getSelectedQuantity: (_stepIndex: number, key: string) => selections[key] || 0,
      validateStepCondition,
      setSelectedQuantity,
      updateProductQuantityDisplay: jest.fn(),
      _renderDirectDefaultProducts: jest.fn(),
      renderModalTabs: jest.fn(),
      updateModalNavigation: jest.fn(),
      updateModalFooterMessaging: jest.fn(),
      updateAddToCartButton: jest.fn(),
      updateFooterMessaging: jest.fn(),
      _syncFreeGiftSlotCard: jest.fn(),
      findProductBySelectionKey: () => ({ id: 'variant-2' }),
      _usesCascadeStepFlow: () => false,
      _maybeAutoAddAfterLastStep: jest.fn(),
      elements: {},
    } as any;

    ProductPageSelectionMethods.updateProductSelection.call(context, 0, 'variant-2', 2);

    expect(validateStepCondition).toHaveBeenCalledWith(0, 'variant-2', 2);
    expect(selections).toEqual({ 'variant-1': 1, 'variant-2': 2 });
    expect(context.updateProductQuantityDisplay).toHaveBeenCalledWith(0, 'variant-1', 1);
    expect(context._modalSlotReplacementTarget).toBeNull();
  });

  it('adds a sibling variant without removing the already selected variant', () => {
    const selections: Record<string, number> = { 'variant-1': 2 };
    const context = {
      selectedProducts: [selections],
      selectedBundle: { steps: [{}] },
      stepProductData: [[{ id: 'product-1', variants: [{ id: 'variant-1' }, { id: 'variant-2' }] }]],
      _modalSlotReplacementTarget: null,
      normalizeSelectionKey: (value: string) => value,
      _getDirectDefaultRequiredQuantity: () => null,
      getVariantAvailable: () => ({ available: null, outOfStock: false }),
      getSelectedQuantity: (_stepIndex: number, key: string) => selections[key] || 0,
      validateStepCondition: jest.fn(() => true),
      setSelectedQuantity: jest.fn((_stepIndex: number, key: string, quantity: number) => {
        selections[key] = quantity;
      }),
      updateProductQuantityDisplay: jest.fn(),
      _renderDirectDefaultProducts: jest.fn(),
      renderModalTabs: jest.fn(),
      updateModalNavigation: jest.fn(),
      updateModalFooterMessaging: jest.fn(),
      updateAddToCartButton: jest.fn(),
      updateFooterMessaging: jest.fn(),
      _syncFreeGiftSlotCard: jest.fn(),
      findProductBySelectionKey: () => ({ id: 'product-1' }),
      _usesCascadeStepFlow: () => false,
      _maybeAutoAddAfterLastStep: jest.fn(),
      elements: {},
    } as any;

    ProductPageSelectionMethods.updateProductSelection.call(context, 0, 'variant-2', 1);

    expect(selections).toEqual({ 'variant-1': 2, 'variant-2': 1 });
    expect(context.updateProductQuantityDisplay).not.toHaveBeenCalledWith(0, 'variant-1', 0);
  });

  it('restores the source quantity when one-unit replacement validation fails', () => {
    const selections: Record<string, number> = { 'variant-1': 2, 'variant-2': 1 };
    const context = {
      selectedProducts: [selections],
      selectedBundle: { steps: [{}] },
      stepProductData: [[{ id: 'product-1', variants: [{ id: 'variant-1' }, { id: 'variant-2' }] }]],
      _modalSlotReplacementTarget: { stepIndex: 0, selectionKey: 'variant-1', quantity: 1 },
      normalizeSelectionKey: (value: string) => value,
      _getDirectDefaultRequiredQuantity: () => null,
      getVariantAvailable: () => ({ available: null, outOfStock: false }),
      getSelectedQuantity: (_stepIndex: number, key: string) => selections[key] || 0,
      validateStepCondition: jest.fn(() => false),
      setSelectedQuantity: jest.fn((_stepIndex: number, key: string, quantity: number) => {
        selections[key] = quantity;
      }),
    } as any;

    ProductPageSelectionMethods.updateProductSelection.call(context, 0, 'variant-2', 2);

    expect(selections).toEqual({ 'variant-1': 2, 'variant-2': 1 });
    expect(context._modalSlotReplacementTarget).toEqual({
      stepIndex: 0,
      selectionKey: 'variant-1',
      quantity: 1,
    });
  });
});

function createFakeDocument() {
  return {
    createElement: (tagName: string) => createFakeElement(tagName),
  };
}

function createFakeElement(tagName: string) {
  const listeners: Record<string, (event: { stopPropagation: () => void }) => void> = {};
  const attributes = new Map<string, string>();
  return {
    tagName: tagName.toUpperCase(),
    className: '',
    dataset: {} as Record<string, string>,
    children: [] as any[],
    appendChild(child: any) {
      this.children.push(child);
      return child;
    },
    addEventListener(name: string, handler: typeof listeners[string]) {
      listeners[name] = handler;
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    getAttribute(name: string) {
      return attributes.get(name) || null;
    },
    dispatch(name: string) {
      listeners[name]?.({ stopPropagation: () => {}, currentTarget: this } as any);
    },
    set innerHTML(_value: string) {},
    textContent: '',
    title: '',
    src: '',
    alt: '',
  };
}
export {};
