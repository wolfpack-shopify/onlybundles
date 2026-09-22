/**
 * Suppresses internal leading-underscore cart line item properties from leaking
 * on legacy Shopify themes (such as Kingdom 3.7.1) that fail to implement the
 * canonical Shopify check `{% unless p.first.first == '_' %}`.
 */

const INTERNAL_PROPERTY_REGEX = /^\s*_(?:is_bundle_parent|bundle_name|bundle_total_retail_cents|wolfpackProductBundle|wolfpack_bundle_runtime|addon_offer_id|wpb_offer_analytics|[a-zA-Z0-9_:-]+)\s*:/;
const BUNDLE_PARENT_PROPERTY_REGEX = /^\s*_is_bundle_parent\s*:/;
const BUNDLE_PRICE_PROPERTY_REGEX = /^\s*Bundle Price\s*:\s*$/;
const CART_LINE_SELECTOR = 'tr, cart-item, line-item, [data-cart-item], .cart-item, .cart__item, .line-item';

export const CART_CONTAINER_SELECTORS = [
  'form[action*="/cart"]',
  'cart-drawer',
  '.cart-drawer',
  '#cart-drawer',
  '.cart__items',
  '#CartContainer',
  '[data-cart-view]',
  '.cart-items',
  '.ajax-cart',
  '.mini-cart',
].join(', ');

function findPropertyWrapper(element: Element | null): Element | null {
  let current = element;
  let candidate: Element | null = null;
  while (current?.parentElement && current !== document.body) {
    const tagName = current.tagName.toUpperCase();
    const className = String(current.className || '');

    if (
      tagName === 'TR' ||
      tagName === 'TABLE' ||
      tagName === 'BODY' ||
      /cart-item(?!__property)|cart__item(?!__property)|line-item/i.test(className) ||
      className === 'content'
    ) {
      break;
    }

    if (
      tagName === 'LI' ||
      tagName === 'DT' ||
      tagName === 'DD'
    ) {
      candidate = current;
      break;
    }

    if (
      (tagName === 'DIV' || tagName === 'P') &&
      /cart-item__property|product-details__item|line-item__property/i.test(className)
    ) {
      candidate = current;
      break;
    }

    current = current.parentElement;
  }
  return candidate;
}

export function cleanupInternalCartProperties(root: ParentNode = document): void {
  if (typeof document === 'undefined' || !document || typeof document.createTreeWalker !== 'function') return;

  const container = (root && 'nodeType' in root && root.nodeType === 9 ? (root as Document).body : root) as ParentNode;
  if (!container) return;

  const showTextFilter = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
  const walker = document.createTreeWalker(
    container,
    showTextFilter,
    null
  );

  const nodesToRemove: (Node | Element)[] = [];

  let currentNode: Node | null = walker.nextNode();
  while (currentNode) {
    const text = currentNode.textContent ?? '';
    if (BUNDLE_PRICE_PROPERTY_REGEX.test(text)) {
      const cartLine = currentNode.parentElement?.closest<HTMLElement>(CART_LINE_SELECTOR);
      if (cartLine) cartLine.dataset.wpbBp = 'true';
    }
    if (INTERNAL_PROPERTY_REGEX.test(text)) {
      if (BUNDLE_PARENT_PROPERTY_REGEX.test(text)) {
        const cartLine = currentNode.parentElement?.closest<HTMLElement>(CART_LINE_SELECTOR);
        if (cartLine) cartLine.dataset.wpbBp = 'true';
      }
      const wrapper = findPropertyWrapper(currentNode.parentElement);
      if (wrapper) {
        nodesToRemove.push(wrapper);
      } else {
        // Fallback for themes like Kingdom dumping text nodes directly into <div class="content">
        nodesToRemove.push(currentNode);
        let sibling = currentNode.nextSibling;
        while (sibling) {
          if (sibling.nodeType === Node.TEXT_NODE) {
            nodesToRemove.push(sibling);
            sibling = sibling.nextSibling;
          } else if (sibling.nodeType === Node.ELEMENT_NODE && (sibling as HTMLElement).tagName === 'BR') {
            nodesToRemove.push(sibling);
            break;
          } else {
            break;
          }
        }
      }
    }
    currentNode = walker.nextNode();
  }

  const uniqueNodes = Array.from(new Set(nodesToRemove));
  for (const node of uniqueNodes) {
    try {
      if ('remove' in node && typeof node.remove === 'function') {
        node.remove();
      } else if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    } catch {
      // Sibling or child already removed
    }
  }
}

let cleanupScheduled = false;

export function scheduleCartPropertiesCleanup(root?: ParentNode): void {
  if (cleanupScheduled || typeof window === 'undefined') return;
  cleanupScheduled = true;

  const scheduleFn = typeof window.requestIdleCallback === 'function'
    ? window.requestIdleCallback
    : typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16);

  scheduleFn(() => {
    cleanupScheduled = false;
    cleanupInternalCartProperties(root);
  });
}

export function initCartPropertiesCleaner(): void {
  if (typeof document === 'undefined') return;

  const cleanupKnownContainers = () => {
    document.querySelectorAll(CART_CONTAINER_SELECTORS).forEach((container) => {
      scheduleCartPropertiesCleanup(container);
    });
  };
  const marker = document.querySelector<HTMLElement>('[data-wpb-app-embed]');
  if (marker?.dataset.cartHasWpbPrivateProperties === 'true') cleanupKnownContainers();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanupKnownContainers, { once: true });
  }

  document.addEventListener('shopify:section:load', cleanupKnownContainers);
  document.addEventListener('shopify:cart:view', cleanupKnownContainers);
  document.addEventListener('shopify:cart:lines-update', (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const completion = detail?.cart ?? detail?.promise ?? detail;
    if (completion && typeof completion.then === 'function') {
      void Promise.resolve(completion).then(cleanupKnownContainers).catch(() => undefined);
      return;
    }
    cleanupKnownContainers();
  });
}
