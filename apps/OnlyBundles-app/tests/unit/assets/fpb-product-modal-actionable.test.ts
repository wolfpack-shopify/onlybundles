import { JSDOM } from 'jsdom';
import {
  BundleProductModal,
  getProductCarouselSwipeDirection,
} from '../../../app/assets/bundle-modal-component';
import {
  getVariantSelectionDraft,
  resolveInitialVariantSelection,
} from '../../../app/assets/widgets/shared/variant-selector';

function product() {
  return {
    id: 'product-1',
    title: 'Actionable product',
    price: 1000,
    imageUrl: 'https://cdn.example/base.jpg',
    images: [
      { url: 'https://cdn.example/base.jpg' },
      { url: 'https://cdn.example/second.jpg' },
    ],
    options: ['Color', 'Size'],
    variants: [
      {
        id: 'red-small',
        option1: 'Red',
        option2: 'Small',
        price: 1000,
        available: true,
        image: { url: 'https://cdn.example/red-small.jpg' },
      },
      {
        id: 'red-large',
        option1: 'Red',
        option2: 'Large',
        price: 1100,
        available: false,
        image: { url: 'https://cdn.example/red-large.jpg' },
      },
      {
        id: 'blue-large',
        option1: 'Blue',
        option2: 'Large',
        price: 1200,
        available: true,
        image: { url: 'https://cdn.example/blue-large.jpg' },
      },
    ],
  };
}

describe('FPB actionable product dialog', () => {
  let dom: JSDOM;
  let modal: BundleProductModal;
  let widget: any;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><button id="trigger">Open</button><div id="bundle-builder-app"></div></body></html>', {
      url: 'https://example.test',
    });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    Object.defineProperty(dom.window, 'scrollTo', { configurable: true, value: jest.fn() });
    const dialogPrototype = dom.window.HTMLDialogElement.prototype as any;
    dialogPrototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    dialogPrototype.close = function close() {
      this.removeAttribute('open');
      this.dispatchEvent(new dom.window.Event('close'));
    };
    widget = {
      container: dom.window.document.getElementById('bundle-builder-app'),
      selectedBundle: { steps: [{ id: 'step-1' }] },
      selectedProducts: [{}],
      updateProductSelection: jest.fn(),
      showToast: jest.fn(),
      _resolveText: (_key: string, fallback: string) => fallback,
    };
    modal = new BundleProductModal(widget);
  });

  afterEach(() => {
    dom.window.close();
  });

  it('uses native dialog semantics, focuses close, restores scroll styles, and returns focus', async () => {
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'visible';

    modal.open({ ...product(), variants: [product().variants[0]], options: [] }, { id: 'step-1' }, {
      trigger,
    });

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('modal-product-title');
    expect(document.activeElement).toBe(dialog.querySelector('.bundle-modal-close'));
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');

    (dialog.querySelector('.bundle-modal-close') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(dialog.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe('auto');
    expect(document.body.style.overflow).toBe('visible');
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the parent product name for a single default variant', () => {
    modal.open({
      id: 'product-default',
      selectionId: 'variant-default',
      variantId: 'variant-default',
      title: 'Default Title',
      productTitle: 'Purely Cashews Roasted',
      price: 1200,
      imageUrl: 'https://cdn.example/cashews.jpg',
      options: [],
      variants: [{
        id: 'variant-default',
        title: 'Default Title',
        price: 1200,
        available: true,
      }],
    }, { id: 'step-1' });

    expect(document.getElementById('modal-product-title')?.textContent)
      .toBe('Purely Cashews Roasted');
    expect((document.getElementById('modal-main-image') as HTMLImageElement).alt)
      .toBe('Purely Cashews Roasted');
  });

  it('dismisses on Escape cancel and backdrop click', () => {
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    modal.open({ ...product(), variants: [product().variants[0]], options: [] }, { id: 'step-1' });
    const cancel = new dom.window.Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);

    modal.open({ ...product(), variants: [product().variants[0]], options: [] }, { id: 'step-1' });
    dialog.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(dialog.open).toBe(false);
  });

  it.each(['STANDARD', 'CLASSIC', 'COMPACT', 'HORIZONTAL'])(
    'is actionable for %s and commits the exact variant ID',
    (preset) => {
      modal.open(product(), { id: 'step-1' }, {
        variantSelectorMode: 'dropdown',
        designPreset: preset,
      });
      const color = document.querySelector<HTMLSelectElement>('[data-option-name="Color"]')!;
      const size = document.querySelector<HTMLSelectElement>('[data-option-name="Size"]')!;
      color.value = 'Blue';
      color.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      expect((document.getElementById('modal-add-to-box') as HTMLButtonElement).disabled).toBe(true);
      size.value = 'Large';
      size.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

      const action = document.getElementById('modal-add-to-box') as HTMLButtonElement;
      expect(action.disabled).toBe(false);
      action.click();
      expect(widget.updateProductSelection).toHaveBeenCalledWith(0, 'blue-large', 1);
    },
  );

  it('keeps a nonexistent choice intact and disables only the CTA', () => {
    const source = product();
    const resolvedCard = {
      ...source,
      ...source.variants[0],
      id: source.id,
      selectionId: source.variants[0].id,
      variantId: source.variants[0].id,
      variants: source.variants,
      options: source.options,
      baseTitle: source.title,
      basePrice: source.price,
      baseImageUrl: source.imageUrl,
      baseImages: source.images,
    };
    modal.open(resolvedCard, { id: 'step-1' }, {
      variantSelectorMode: 'dropdown',
      selection: { Color: 'Red', Size: 'Small' },
    });
    const color = document.querySelector<HTMLSelectElement>('[data-option-name="Color"]')!;
    const size = document.querySelector<HTMLSelectElement>('[data-option-name="Size"]')!;
    color.value = 'Blue';
    color.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    size.value = 'Small';
    size.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    const action = document.getElementById('modal-add-to-box') as HTMLButtonElement;
    expect(color.value).toBe('Blue');
    expect(size.value).toBe('Small');
    expect(action.disabled).toBe(true);
    expect(action.textContent).toBe('Out of stock');
    expect(document.getElementById('modal-product-title')?.textContent).toBe('Actionable product');
    expect((document.getElementById('modal-main-image') as HTMLImageElement).src)
      .toBe('https://cdn.example/base.jpg');
  });

  it('opens a committed exact variant at its quantity and updates only that variant', () => {
    widget.selectedProducts[0]['blue-large'] = 3;
    modal.open(product(), { id: 'step-1' }, {
      variantSelectorMode: 'dropdown',
      selection: { Color: 'Blue', Size: 'Large' },
    });

    expect(document.getElementById('modal-qty-display')?.textContent).toBe('3');
    expect(document.getElementById('modal-add-to-box')?.textContent).toBe('Update quantity');
    (document.getElementById('modal-qty-increase') as HTMLButtonElement).click();
    (document.getElementById('modal-add-to-box') as HTMLButtonElement).click();
    expect(widget.updateProductSelection).toHaveBeenCalledWith(0, 'blue-large', 4);
    expect(widget.selectedProducts[0]['red-small']).toBeUndefined();
  });

  it('commits the modal draft before a synchronous card rerender', () => {
    const draftKey = 'step-1:category-1:product-1';
    let rerenderedSelection: Record<string, string> | undefined;
    widget.updateProductSelection.mockImplementation(() => {
      rerenderedSelection = resolveInitialVariantSelection({
        product: product(),
        draft: getVariantSelectionDraft(widget, draftKey),
        committedVariantIds: ['red-small', 'blue-large'],
      }).selection;
    });
    modal.open(product(), { id: 'step-1' }, {
      variantSelectorMode: 'dropdown',
      selection: { Color: 'Blue', Size: 'Large' },
      draftKey,
    });

    (document.getElementById('modal-add-to-box') as HTMLButtonElement).click();

    expect(rerenderedSelection).toEqual({ Color: 'Blue', Size: 'Large' });
  });

  it('keeps an unavailable individual variant exact and renders no selector', () => {
    const individual = {
      ...product(),
      id: 'red-large',
      selectionId: 'red-large',
      variantId: 'red-large',
      selectedOptions: [
        { name: 'Color', value: 'Red' },
        { name: 'Size', value: 'Large' },
      ],
    };
    modal.open(individual, { id: 'step-1' }, {
      displayVariantsAsIndividualProducts: true,
    });

    expect(document.querySelector('.vs-wrapper')).toBeNull();
    expect(document.getElementById('modal-selection-text')?.textContent).toBe('Red / Large');
    expect((document.getElementById('modal-add-to-box') as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById('modal-add-to-box')?.textContent).toBe('Out of stock');
  });

  it('keeps the dialog and modal draft open when the selection mutation is rejected', () => {
    widget.updateProductSelection.mockReturnValue(false);
    modal.open(product(), { id: 'step-1' }, {
      variantSelectorMode: 'dropdown',
      selection: { Color: 'Blue', Size: 'Large' },
      draftKey: 'step-1:category-1:product-1',
    });

    (document.getElementById('modal-add-to-box') as HTMLButtonElement).click();

    expect((document.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
    expect(widget.showToast).not.toHaveBeenCalled();
  });

  it('renders keyboard-operable thumbnails and keeps their selected state current', () => {
    modal.open({ ...product(), variants: [product().variants[0]], options: [] }, { id: 'step-1' });
    const thumbnails = Array.from(document.querySelectorAll<HTMLButtonElement>('.bundle-modal-thumbnail'));
    expect(thumbnails.length).toBeGreaterThan(1);
    expect(thumbnails[0].getAttribute('aria-pressed')).toBe('true');
    thumbnails[1].click();
    expect(document.querySelectorAll('.bundle-modal-thumbnail')[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps horizontal image swipes and ignores vertical gestures', () => {
    expect(getProductCarouselSwipeDirection({ distanceX: -64, distanceY: 8 })).toBe(1);
    expect(getProductCarouselSwipeDirection({ distanceX: 64, distanceY: 8 })).toBe(-1);
    expect(getProductCarouselSwipeDirection({ distanceX: -64, distanceY: 80 })).toBe(0);
  });
});
