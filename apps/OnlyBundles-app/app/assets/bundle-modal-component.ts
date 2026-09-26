/**
 * Shared actionable FPB product dialog.
 */
'use strict';

import { sanitizeRichHtmlFragment } from './widgets/shared/rich-html.js';
import { createChevronIcon, createCloseIcon } from './widgets/shared/svg-icons.js';
import { BUNDLE_WIDGET } from './widgets/shared/constants.js';
import { CurrencyManager } from './widgets/shared/currency-manager.js';
import {
  getVariantSelectionDraft,
  resolveExactVariantSelection,
  selectionForVariant,
  setVariantSelectionDraft,
  VariantSelectorComponent,
  type VariantSelectionResult,
} from './widgets/shared/variant-selector.js';

export interface BundleProductModal {
  [key: string]: any;
}

export function getProductCarouselSwipeDirection({
  distanceX = 0,
  distanceY = 0,
}: any = {}) {
  const horizontalDistance = Number(distanceX);
  const verticalDistance = Math.abs(Number(distanceY));
  if (!Number.isFinite(horizontalDistance) || !Number.isFinite(verticalDistance)) return 0;
  if (Math.abs(horizontalDistance) < 48 || verticalDistance >= Math.abs(horizontalDistance)) return 0;
  return horizontalDistance < 0 ? 1 : -1;
}

function hasMeaningfulDescription(element: HTMLElement) {
  if (element.textContent?.trim()) return true;
  return Boolean(element.querySelector('img, picture, video, iframe, svg, canvas'));
}

function isSellable(candidate: any) {
  return candidate?.available !== false && candidate?.availableForSale !== false;
}

function variantId(candidate: any) {
  return String(candidate?.selectionId || candidate?.variantId || candidate?.id || '');
}

function resolveProductDisplayTitle(product: any = {}) {
  const candidates = [
    product?.baseTitle,
    product?.parentTitle,
    product?.productTitle,
    product?.title,
  ];
  return candidates
    .map((candidate) => String(candidate || '').trim())
    .find((candidate) => candidate && candidate !== 'Default Title') || '';
}

export class BundleProductModal {
  widget: any;
  modalElement: HTMLDialogElement | null;
  currentProduct: any;
  currentStep: any;
  selectionResult: VariantSelectionResult;
  selectedQuantity: number;
  currentImageIndex: number;
  trigger: HTMLElement | null;
  draftKey: string;
  configuration: any;
  lockedScrollY: number;
  previousScrollStyles: Record<string, string> | null;

  constructor(widget: any) {
    this.widget = widget;
    this.modalElement = null;
    this.currentProduct = null;
    this.currentStep = null;
    this.selectionResult = { status: 'incomplete', selection: {}, variant: null };
    this.selectedQuantity = 1;
    this.currentImageIndex = 0;
    this.trigger = null;
    this.draftKey = '';
    this.configuration = {};
    this.lockedScrollY = 0;
    this.previousScrollStyles = null;
    this.init();
  }

  text(key: string, fallback: string) {
    return typeof this.widget?._resolveText === 'function'
      ? this.widget._resolveText(key, fallback)
      : fallback;
  }

  init() {
    this.createModalHTML();
    this.attachEventListeners();
  }

  createModalHTML() {
    const dialog = document.createElement('dialog');
    dialog.className = 'bundle-modal-overlay';
    dialog.id = 'bundle-product-modal';
    dialog.setAttribute('aria-labelledby', 'modal-product-title');

    const container = document.createElement('div');
    container.className = 'bundle-modal-container';

    const header = document.createElement('header');
    header.className = 'bundle-modal-header';
    const title = document.createElement('h2');
    title.className = 'bundle-modal-title';
    title.id = 'modal-product-title';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bundle-modal-close';
    close.setAttribute('aria-label', this.text('closeModalText', 'Close product details'));
    close.append(createCloseIcon(document));
    header.append(title, close);

    const scroll = document.createElement('div');
    scroll.className = 'bundle-modal-scroll';
    const content = document.createElement('div');
    content.className = 'bundle-modal-content';

    const images = document.createElement('div');
    images.className = 'bundle-modal-images';
    const imageFrame = document.createElement('div');
    imageFrame.className = 'bundle-modal-main-image';
    const mainImage = document.createElement('img');
    mainImage.id = 'modal-main-image';
    const previousImage = document.createElement('button');
    previousImage.type = 'button';
    previousImage.className = 'bundle-modal-image-nav bundle-modal-image-nav--prev';
    previousImage.dataset.modalImageNav = 'prev';
    previousImage.setAttribute('aria-label', this.text('productImagePreviousLabel', 'Previous image'));
    previousImage.append(createChevronIcon(document, 'left'));
    const nextImage = document.createElement('button');
    nextImage.type = 'button';
    nextImage.className = 'bundle-modal-image-nav bundle-modal-image-nav--next';
    nextImage.dataset.modalImageNav = 'next';
    nextImage.setAttribute('aria-label', this.text('productImageNextLabel', 'Next image'));
    nextImage.append(createChevronIcon(document, 'right'));
    imageFrame.append(mainImage, previousImage, nextImage);
    const thumbnails = document.createElement('div');
    thumbnails.className = 'bundle-modal-thumbnails';
    thumbnails.dataset.modalThumbnails = 'true';
    images.append(imageFrame, thumbnails);

    const details = document.createElement('div');
    details.className = 'bundle-modal-details';
    const selection = document.createElement('div');
    selection.className = 'bundle-modal-selection-summary';
    selection.id = 'modal-selection-summary';
    selection.hidden = true;
    const selectionText = document.createElement('strong');
    selectionText.id = 'modal-selection-text';
    selection.append(selectionText);
    const price = document.createElement('div');
    price.className = 'bundle-modal-price';
    price.id = 'modal-product-price';
    const description = document.createElement('div');
    description.className = 'bundle-modal-description';
    description.id = 'modal-product-description';
    const variants = document.createElement('div');
    variants.className = 'bundle-modal-variants';
    variants.id = 'modal-variants-container';
    const quantity = document.createElement('div');
    quantity.className = 'bundle-modal-quantity';
    const quantityLabel = document.createElement('span');
    quantityLabel.className = 'bundle-modal-quantity-label';
    quantityLabel.textContent = this.text('quantityLabel', 'Quantity');
    const quantityControls = document.createElement('div');
    quantityControls.className = 'bundle-modal-quantity-controls';
    const decrease = document.createElement('button');
    decrease.type = 'button';
    decrease.className = 'bundle-modal-qty-btn';
    decrease.id = 'modal-qty-decrease';
    decrease.setAttribute('aria-label', this.text('decreaseQuantityText', 'Decrease quantity'));
    decrease.textContent = '−';
    const quantityDisplay = document.createElement('span');
    quantityDisplay.className = 'bundle-modal-qty-display';
    quantityDisplay.id = 'modal-qty-display';
    quantityDisplay.setAttribute('aria-live', 'polite');
    const increase = document.createElement('button');
    increase.type = 'button';
    increase.className = 'bundle-modal-qty-btn';
    increase.id = 'modal-qty-increase';
    increase.setAttribute('aria-label', this.text('increaseQuantityText', 'Increase quantity'));
    increase.textContent = '+';
    quantityControls.append(decrease, quantityDisplay, increase);
    quantity.append(quantityLabel, quantityControls);
    details.append(selection, price, description, variants, quantity);
    content.append(images, details);
    scroll.append(content);

    const footer = document.createElement('footer');
    footer.className = 'bundle-modal-footer';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'bundle-modal-add-btn';
    action.id = 'modal-add-to-box';
    footer.append(action);
    container.append(header, scroll, footer);
    dialog.append(container);
    const mount = this.widget?.container?.append ? this.widget.container : document.body;
    mount.append(dialog);
    this.modalElement = dialog;
  }

  attachEventListeners() {
    if (!this.modalElement) return;
    this.modalElement.querySelector('.bundle-modal-close')?.addEventListener('click', () => this.close());
    this.modalElement.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });
    this.modalElement.addEventListener('click', (event) => {
      if (event.target === this.modalElement) this.close();
    });
    this.modalElement.addEventListener('close', () => this.finishClose());
    this.modalElement.querySelector('#modal-qty-decrease')?.addEventListener('click', () => {
      this.updateQuantity(Math.max(1, this.selectedQuantity - 1));
    });
    this.modalElement.querySelector('#modal-qty-increase')?.addEventListener('click', () => {
      this.updateQuantity(this.selectedQuantity + 1);
    });
    this.modalElement.querySelector('#modal-add-to-box')?.addEventListener('click', () => this.addToBundle());
    this.modalElement.querySelectorAll('[data-modal-image-nav]').forEach((button: Element) => {
      button.addEventListener('click', () => {
        this.showAdjacentImage((button as HTMLElement).dataset.modalImageNav === 'prev' ? -1 : 1);
      });
    });
    this.setupImageCarouselGestures();
  }

  setupImageCarouselGestures() {
    const imageFrame = this.modalElement?.querySelector('.bundle-modal-main-image');
    if (!imageFrame) return;
    let gesture: any = null;
    imageFrame.addEventListener('pointerdown', (event: any) => {
      gesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
      (imageFrame as HTMLElement).setPointerCapture?.(event.pointerId);
    });
    imageFrame.addEventListener('pointerup', (event: any) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const direction = getProductCarouselSwipeDirection({
        distanceX: event.clientX - gesture.startX,
        distanceY: event.clientY - gesture.startY,
      });
      gesture = null;
      if (direction) this.showAdjacentImage(direction);
    });
    imageFrame.addEventListener('pointercancel', () => {
      gesture = null;
    });
  }

  lockDocumentScroll() {
    if (this.previousScrollStyles) return;
    const root = document.documentElement;
    const body = document.body;
    this.lockedScrollY = Math.max(0, Number(window.scrollY) || 0);
    this.previousScrollStyles = {
      rootOverflow: root.style.overflow,
      rootScrollbarGutter: root.style.scrollbarGutter,
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    };
    root.style.overflow = 'hidden';
    root.style.scrollbarGutter = 'stable';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
  }

  unlockDocumentScroll() {
    if (!this.previousScrollStyles) return;
    const root = document.documentElement;
    const body = document.body;
    root.style.overflow = this.previousScrollStyles.rootOverflow;
    root.style.scrollbarGutter = this.previousScrollStyles.rootScrollbarGutter;
    body.style.overflow = this.previousScrollStyles.bodyOverflow;
    body.style.overscrollBehavior = this.previousScrollStyles.bodyOverscrollBehavior;
    window.scrollTo?.(0, this.lockedScrollY);
    this.previousScrollStyles = null;
  }

  open(product: any, step: any, options: any = {}) {
    if (!this.modalElement) return;
    this.currentProduct = { ...product };
    this.currentStep = step;
    this.configuration = options;
    this.trigger = options.trigger?.nodeType === 1
      ? options.trigger
      : document.activeElement as HTMLElement;
    this.draftKey = String(options.draftKey || '');
    this.currentImageIndex = Math.max(0, Number(options.initialImageIndex || 0));
    this.selectionResult = this.initialSelectionResult(options.selection || {});
    this.syncQuantityFromSelection();
    this.populateModal();
    this.lockDocumentScroll();
    if (typeof this.modalElement.showModal === 'function') {
      this.modalElement.showModal();
    } else {
      this.modalElement.setAttribute('open', '');
    }
    this.modalElement.querySelector<HTMLElement>('.bundle-modal-close')?.focus({ preventScroll: true });
  }

  initialSelectionResult(selection: Record<string, string>) {
    const variants = Array.isArray(this.currentProduct?.variants) ? this.currentProduct.variants : [];
    if (this.configuration.displayVariantsAsIndividualProducts === true) {
      const currentId = variantId(this.currentProduct);
      const candidate = variants.find((variant: any) => variantId(variant) === currentId)
        || this.currentProduct;
      return {
        status: isSellable(candidate) ? 'available' : 'unavailable',
        selection: selectionForVariant(this.currentProduct, candidate),
        variant: candidate,
      } as VariantSelectionResult;
    }
    if (variants.length <= 1) {
      const candidate = variants[0] || this.currentProduct;
      return {
        status: isSellable(candidate) ? 'available' : 'unavailable',
        selection,
        variant: candidate,
      } as VariantSelectionResult;
    }
    return resolveExactVariantSelection(this.currentProduct, selection);
  }

  close() {
    if (!this.modalElement) return;
    if (this.modalElement.open && typeof this.modalElement.close === 'function') {
      this.modalElement.close();
      return;
    }
    this.modalElement.removeAttribute('open');
    this.finishClose();
  }

  finishClose() {
    this.unlockDocumentScroll();
    const returnTarget = this.trigger;
    this.currentProduct = null;
    this.currentStep = null;
    this.selectionResult = { status: 'incomplete', selection: {}, variant: null };
    this.selectedQuantity = 1;
    this.currentImageIndex = 0;
    this.trigger = null;
    queueMicrotask(() => returnTarget?.focus?.({ preventScroll: true }));
  }

  populateModal() {
    if (!this.modalElement) return;
    const title = resolveProductDisplayTitle(this.currentProduct);
    this.modalElement.querySelector('#modal-product-title')!.textContent = title;
    const description = this.modalElement.querySelector<HTMLElement>('#modal-product-description')!;
    const descriptionHtml = String(this.currentProduct?.descriptionHtml || '').trim();
    if (descriptionHtml) {
      description.replaceChildren(sanitizeRichHtmlFragment(descriptionHtml, 'product-description'));
    } else {
      description.textContent = this.currentProduct?.description || '';
    }
    description.hidden = !hasMeaningfulDescription(description);
    this.renderVariantSelector();
    this.updatePresentation();
  }

  renderVariantSelector() {
    const container = this.modalElement?.querySelector<HTMLElement>('#modal-variants-container');
    if (!container) return;
    if (this.configuration.displayVariantsAsIndividualProducts === true) {
      container.replaceChildren();
      return;
    }
    const selector = VariantSelectorComponent.createConfiguredElement(
      this.currentProduct,
      this.configuration.primaryOptionName || null,
      {
        variantSelectorMode: this.configuration.variantSelectorMode || 'dropdown',
        swatchTooltipEnabled: this.configuration.swatchTooltipEnabled === true,
        selection: this.selectionResult.selection,
      },
      document,
    );
    container.replaceChildren(...(selector ? [selector] : []));
    if (!selector) return;
    VariantSelectorComponent.attachListeners(selector, this.currentProduct, (result: VariantSelectionResult) => {
      this.selectionResult = result;
      this.currentImageIndex = 0;
      this.syncQuantityFromSelection();
      this.updatePresentation();
    });
  }

  syncQuantityFromSelection() {
    const id = variantId(this.selectionResult.variant);
    const steps = this.widget?.selectedBundle?.steps || [];
    const stepIndex = steps.findIndex((candidate: any) => candidate?.id === this.currentStep?.id);
    const committedQuantity = id && stepIndex >= 0
      ? Number(this.widget?.selectedProducts?.[stepIndex]?.[id] || 0)
      : 0;
    this.selectedQuantity = committedQuantity > 0 ? committedQuantity : 1;
  }

  updatePresentation() {
    if (!this.modalElement) return;
    const presented = this.getPresentedProduct();
    const title = this.modalElement.querySelector<HTMLElement>('#modal-product-title');
    if (title) {
      title.textContent = resolveProductDisplayTitle(this.currentProduct)
        || resolveProductDisplayTitle(presented);
    }
    this.updatePrice(presented);
    this.loadImage(presented);
    this.updateSelectionSummary();
    this.updateQuantity(this.selectedQuantity);
    this.updateAvailability();
  }

  getPresentedProduct() {
    const useVariantPresentation = this.selectionResult.status === 'available'
      || this.selectionResult.status === 'unavailable';
    if (useVariantPresentation && this.selectionResult.variant) {
      return this.selectionResult.variant;
    }
    return {
      title: resolveProductDisplayTitle(this.currentProduct),
      price: this.currentProduct?.basePrice ?? this.currentProduct?.price,
      compareAtPrice: this.currentProduct?.baseCompareAtPrice,
      currencyCode: this.currentProduct?.currencyCode,
      imageUrl: this.currentProduct?.baseImageUrl || BUNDLE_WIDGET.PLACEHOLDER_IMAGE,
      images: Array.isArray(this.currentProduct?.baseImages) ? this.currentProduct.baseImages : [],
      parentPresentation: true,
    };
  }

  updateSelectionSummary() {
    const summary = this.modalElement?.querySelector<HTMLElement>('#modal-selection-summary');
    const text = this.modalElement?.querySelector<HTMLElement>('#modal-selection-text');
    if (!summary || !text) return;
    const values = Object.values(this.selectionResult.selection).filter(Boolean);
    text.textContent = values.join(' / ');
    summary.hidden = values.length === 0;
  }

  updatePrice(candidate: any) {
    const price = this.modalElement?.querySelector<HTMLElement>('#modal-product-price');
    if (!price) return;
    const rawPrice = candidate?.price ?? this.currentProduct?.price ?? 0;
    const finalPrice = this.widget?.getSubscriptionProductCardPrice
      ? this.widget.getSubscriptionProductCardPrice(rawPrice)
      : rawPrice;
    const rawCompareAt = candidate?.compareAtPrice ?? candidate?.compare_at_price;
    const compareAt = typeof rawCompareAt === 'object' ? rawCompareAt?.amount : rawCompareAt;
    const currencyCode = candidate?.currencyCode || this.currentProduct?.currencyCode || '';
    price.replaceChildren();
    if (compareAt && Number(compareAt) > Number(finalPrice)) {
      const strike = document.createElement('span');
      strike.className = 'bundle-modal-price-strike';
      strike.textContent = CurrencyManager.formatMoney(compareAt, currencyCode);
      const sale = document.createElement('span');
      sale.className = 'bundle-modal-price-sale';
      sale.textContent = CurrencyManager.formatMoney(finalPrice, currencyCode);
      price.append(strike, sale);
    } else {
      price.textContent = CurrencyManager.formatMoney(finalPrice, currencyCode);
    }
  }

  normalizeImageUrl(value: any) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.url || value.src || value.originalSrc || value.transformedSrc || '';
  }

  getProductImages(candidate: any = null) {
    if (!this.currentProduct) return [BUNDLE_WIDGET.PLACEHOLDER_IMAGE];
    const urls: string[] = [];
    const add = (value: any) => {
      const url = this.normalizeImageUrl(value);
      if (url && !urls.includes(url)) urls.push(url);
    };
    if (candidate?.parentPresentation === true) {
      add(candidate.imageUrl);
      (Array.isArray(candidate.images) ? candidate.images : []).forEach(add);
      return urls.length > 0 ? urls : [BUNDLE_WIDGET.PLACEHOLDER_IMAGE];
    }
    if (candidate && candidate !== this.currentProduct) {
      add(candidate.image);
      add(candidate.featuredImage);
      add(candidate.imageUrl);
    }
    add(this.currentProduct.imageUrl);
    add(this.currentProduct.image);
    add(this.currentProduct.featuredImage);
    (Array.isArray(this.currentProduct.images) ? this.currentProduct.images : []).forEach(add);
    return urls.length > 0 ? urls : [BUNDLE_WIDGET.PLACEHOLDER_IMAGE];
  }

  loadImage(candidate: any) {
    const image = this.modalElement?.querySelector<HTMLImageElement>('#modal-main-image');
    const thumbnails = this.modalElement?.querySelector<HTMLElement>('[data-modal-thumbnails]');
    if (!image || !thumbnails) return;
    const images = this.getProductImages(candidate);
    this.currentImageIndex = Math.min(this.currentImageIndex, images.length - 1);
    image.src = images[this.currentImageIndex];
    image.alt = resolveProductDisplayTitle(this.currentProduct)
      || resolveProductDisplayTitle(candidate)
      || this.text('productImageLabel', 'Product image');
    this.modalElement?.querySelectorAll<HTMLElement>('[data-modal-image-nav]').forEach((button) => {
      button.hidden = images.length <= 1;
    });
    const thumbnailButtons = images.map((url, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bundle-modal-thumbnail';
      button.setAttribute('aria-label', `${this.text('productImageLabel', 'Product image')} ${index + 1}`);
      button.setAttribute('aria-pressed', index === this.currentImageIndex ? 'true' : 'false');
      const thumbnail = document.createElement('img');
      thumbnail.src = url;
      thumbnail.alt = '';
      button.append(thumbnail);
      button.addEventListener('click', () => {
        this.currentImageIndex = index;
        this.loadImage(candidate);
      });
      return button;
    });
    thumbnails.hidden = images.length <= 1;
    thumbnails.replaceChildren(...thumbnailButtons);
  }

  showAdjacentImage(direction: number) {
    const candidate = this.getPresentedProduct();
    const images = this.getProductImages(candidate);
    if (images.length <= 1) return;
    this.currentImageIndex = (this.currentImageIndex + direction + images.length) % images.length;
    this.loadImage(candidate);
  }

  updateQuantity(quantity: number) {
    this.selectedQuantity = Math.max(1, Number(quantity) || 1);
    const display = this.modalElement?.querySelector('#modal-qty-display');
    if (display) display.textContent = String(this.selectedQuantity);
  }

  updateAvailability() {
    const action = this.modalElement?.querySelector<HTMLButtonElement>('#modal-add-to-box');
    if (!action) return;
    const id = variantId(this.selectionResult.variant);
    const steps = this.widget?.selectedBundle?.steps || [];
    const stepIndex = steps.findIndex((candidate: any) => candidate?.id === this.currentStep?.id);
    const isCommitted = Boolean(id && stepIndex >= 0 && this.widget?.selectedProducts?.[stepIndex]?.[id] > 0);
    if (this.selectionResult.status === 'incomplete') {
      action.disabled = true;
      action.textContent = this.text('selectVariantText', 'Select variant');
    } else if (this.selectionResult.status === 'unavailable' || this.selectionResult.status === 'nonexistent') {
      action.disabled = true;
      action.textContent = this.text('outOfStockText', 'Out of stock');
    } else {
      action.disabled = false;
      action.textContent = isCommitted
        ? this.text('updateQuantityText', 'Update quantity')
        : this.text('addToBoxText', 'Add To Box');
    }
    action.classList.toggle('out-of-stock', action.disabled && this.selectionResult.status !== 'incomplete');
  }

  addToBundle() {
    if (this.selectionResult.status !== 'available' || !this.currentStep) return;
    const id = variantId(this.selectionResult.variant);
    const steps = this.widget?.selectedBundle?.steps || [];
    const stepIndex = steps.findIndex((candidate: any) => candidate?.id === this.currentStep.id);
    if (!id || stepIndex < 0 || typeof this.widget?.updateProductSelection !== 'function') return;
    const previousDraft = this.draftKey
      ? getVariantSelectionDraft(this.widget, this.draftKey)
      : null;
    if (this.draftKey) {
      setVariantSelectionDraft(this.widget, this.draftKey, this.selectionResult.selection);
    }
    const updated = this.widget.updateProductSelection(stepIndex, id, this.selectedQuantity);
    if (updated === false) {
      if (this.draftKey && previousDraft) {
        setVariantSelectionDraft(this.widget, this.draftKey, previousDraft);
      }
      return;
    }
    this.close();
    this.widget?.showToast?.(this.text('productAddedText', 'Product added to bundle!'), 'success');
  }
}
