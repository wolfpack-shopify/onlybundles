export {};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  createVariantDraftKey,
  getVariantSelectionDraft,
  resolveCanonicalOptionValueSwatch,
  resolveExactVariantSelection,
  resolveInitialVariantSelection,
  setVariantSelectionDraft,
  VariantSelectorComponent,
} = require('../../../app/assets/widgets/shared/variant-selector.js');

function createProduct() {
  return {
    id: 'product-shirt',
    price: 1000,
    imageUrl: 'https://cdn.example/product.jpg',
    options: [
      {
        name: 'Color',
        optionValues: [
          { name: 'Red', swatch: { color: '#f00', image: null } },
          { name: 'Blue', swatch: { color: '#00f', image: null } },
        ],
      },
      { name: 'Size', optionValues: [] },
    ],
    variants: [
      {
        id: 'red-small',
        option1: 'Red',
        option2: 'Small',
        selectedOptions: [{ name: 'Color', value: 'Red' }, { name: 'Size', value: 'Small' }],
        available: true,
        price: 1000,
      },
      {
        id: 'red-large',
        option1: 'Red',
        option2: 'Large',
        selectedOptions: [{ name: 'Color', value: 'Red' }, { name: 'Size', value: 'Large' }],
        available: false,
        price: 1100,
      },
      {
        id: 'blue-large',
        option1: 'Blue',
        option2: 'Large',
        selectedOptions: [{ name: 'Color', value: 'Blue' }, { name: 'Size', value: 'Large' }],
        available: true,
        price: 1200,
      },
    ],
  };
}

describe('FPB exact variant-selection contract', () => {
  it('distinguishes incomplete, available, unavailable, and nonexistent combinations', () => {
    const product = createProduct();
    expect(resolveExactVariantSelection(product, {}).status).toBe('incomplete');
    expect(resolveExactVariantSelection(product, { Color: 'Red', Size: 'Small' })).toMatchObject({
      status: 'available',
      variant: { id: 'red-small' },
    });
    expect(resolveExactVariantSelection(product, { Color: 'Red', Size: 'Large' })).toMatchObject({
      status: 'unavailable',
      variant: { id: 'red-large' },
    });
    expect(resolveExactVariantSelection(product, { Color: 'Blue', Size: 'Small' })).toEqual({
      status: 'nonexistent',
      selection: { Color: 'Blue', Size: 'Small' },
      variant: null,
    });
  });

  it('starts every dropdown dimension blank with an associated hidden placeholder label', () => {
    const document = new JSDOM('<!doctype html>').window.document;
    const selector = VariantSelectorComponent.createConfiguredElement(
      createProduct(),
      null,
      { variantSelectorMode: 'dropdown' },
      document,
    );
    const selects = Array.from(selector.querySelectorAll('select')) as HTMLSelectElement[];

    expect(selects).toHaveLength(2);
    expect(selects.map((select) => select.value)).toEqual(['', '']);
    expect(selects.map((select) => select.options[0].textContent)).toEqual([
      'Select Color',
      'Select Size',
    ]);
    expect(selects.every((select) => select.options[0].disabled)).toBe(true);
    expect(selects.map((select) => selector.querySelector(`label[for="${select.id}"]`)?.textContent))
      .toEqual(['Select Color', 'Select Size']);
  });

  it('reports an exact choice without silently changing its sibling dimension', () => {
    const dom = new JSDOM('<!doctype html><article></article>');
    const card = dom.window.document.querySelector('article')!;
    const product = createProduct();
    const callback = jest.fn();
    card.append(VariantSelectorComponent.createConfiguredElement(
      product,
      null,
      { variantSelectorMode: 'dropdown' },
      dom.window.document,
    ));
    VariantSelectorComponent.attachListeners(card, product, callback);
    const color = card.querySelector('[data-option-name="Color"]') as HTMLSelectElement;
    const size = card.querySelector('[data-option-name="Size"]') as HTMLSelectElement;

    color.value = 'Blue';
    color.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'incomplete',
      selection: { Color: 'Blue' },
    }));
    expect(size.value).toBe('');

    size.value = 'Small';
    size.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(callback).toHaveBeenLastCalledWith({
      status: 'nonexistent',
      selection: { Color: 'Blue', Size: 'Small' },
      variant: null,
    });
    expect(color.value).toBe('Blue');
    expect(size.value).toBe('Small');
  });

  it('keeps unavailable and nonexistent values selectable while describing current availability', () => {
    const document = new JSDOM('<!doctype html>').window.document;
    const selector = VariantSelectorComponent.createConfiguredElement(
      createProduct(),
      'Color',
      {
        variantSelectorMode: 'pill',
        selection: { Color: 'Red', Size: 'Small' },
      },
      document,
    );
    const blue = selector.querySelector('input[value="Blue"]') as HTMLInputElement;
    const size = selector.querySelector('[data-option-name="Size"]') as HTMLSelectElement;

    expect(blue.disabled).toBe(false);
    const large = Array.from(size.options).find((option) => option.value === 'Large')!;
    expect(large.disabled).toBe(false);
    expect(large.textContent).toContain('out of stock');
  });

  it('uses the configured pill dimension or the fewest-value dimension with Shopify order as the tie break', () => {
    const document = new JSDOM('<!doctype html>').window.document;
    const selector = VariantSelectorComponent.createConfiguredElement(
      createProduct(),
      'Size',
      { variantSelectorMode: 'pill' },
      document,
    );
    expect(selector.querySelector('legend')?.textContent).toBe('Size');
    expect(selector.querySelectorAll('select')).toHaveLength(1);
  });

  it('uses only canonical complete swatch mappings and renders post-save drift as a neutral pill', () => {
    const document = new JSDOM('<!doctype html>').window.document;
    const product: any = createProduct();
    product.options[0].optionValues[1].swatch = null;
    const selector = VariantSelectorComponent.createConfiguredElement(
      product,
      'Color',
      { variantSelectorMode: 'color_swatch' },
      document,
    );

    expect(selector.querySelectorAll('[data-swatch-kind="color"]')).toHaveLength(1);
    expect(selector.querySelector('input[value="Blue"]')?.closest('.vs-radio-control--neutral'))
      .not.toBeNull();
    expect(selector.querySelector('input[value="Blue"]')?.nextElementSibling?.textContent).toBe('Blue');
    expect(resolveCanonicalOptionValueSwatch(product, 'Color', 'Blue')).toBeNull();
  });

  it('restores the first committed variant in Shopify order and retains a current draft when several are committed', () => {
    const product = createProduct();
    expect(resolveInitialVariantSelection({
      product,
      committedVariantIds: ['blue-large', 'red-small'],
    })).toMatchObject({ status: 'available', variant: { id: 'red-small' } });
    expect(resolveInitialVariantSelection({
      product,
      draft: { Color: 'Blue' },
      committedVariantIds: ['blue-large', 'red-small'],
    })).toEqual({
      status: 'incomplete',
      selection: { Color: 'Blue' },
      variant: null,
    });
  });

  it('restores committed Storefront variants by canonical selectionId', () => {
    const source = createProduct();
    const productWithSelectionIds = {
      ...source,
      variants: source.variants.map((variant) => ({
        ...variant,
        selectionId: `gid://shopify/ProductVariant/${variant.id}`,
        id: undefined,
      })),
    };
    const result = resolveInitialVariantSelection({
      product: productWithSelectionIds,
      committedVariantIds: ['gid://shopify/ProductVariant/blue-large'],
    });

    expect(result.status).toBe('available');
    expect(result.selection).toEqual({ Color: 'Blue', Size: 'Large' });
    expect(result.variant?.selectionId).toBe('gid://shopify/ProductVariant/blue-large');
  });

  it('keeps drafts isolated by owner, step, category, and parent product', () => {
    const firstOwner = {};
    const secondOwner = {};
    const firstKey = createVariantDraftKey({
      stepId: 'step-1',
      categoryId: 'category-1',
      product: createProduct(),
    });
    const secondKey = createVariantDraftKey({
      stepId: 'step-1',
      categoryId: 'category-2',
      product: createProduct(),
    });
    setVariantSelectionDraft(firstOwner, firstKey, { Color: 'Red' });
    setVariantSelectionDraft(firstOwner, secondKey, { Color: 'Blue' });

    expect(getVariantSelectionDraft(firstOwner, firstKey)).toEqual({ Color: 'Red' });
    expect(getVariantSelectionDraft(firstOwner, secondKey)).toEqual({ Color: 'Blue' });
    expect(getVariantSelectionDraft(secondOwner, firstKey)).toEqual({});
  });

  it('creates unique native IDs and radio names for repeated product renderings', () => {
    const document = new JSDOM('<!doctype html>').window.document;
    const first = VariantSelectorComponent.createConfiguredElement(
      createProduct(), 'Color', { variantSelectorMode: 'pill' }, document,
    );
    const second = VariantSelectorComponent.createConfiguredElement(
      createProduct(), 'Color', { variantSelectorMode: 'pill' }, document,
    );
    const inputs = [...first.querySelectorAll('input'), ...second.querySelectorAll('input')];

    expect(new Set(inputs.map((input: HTMLInputElement) => input.id)).size).toBe(inputs.length);
    expect(first.querySelector('input')?.name).not.toBe(second.querySelector('input')?.name);
  });
});
