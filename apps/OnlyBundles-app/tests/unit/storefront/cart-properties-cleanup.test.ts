import { JSDOM } from 'jsdom';
import {
  cleanupInternalCartProperties,
  scheduleCartPropertiesCleanup,
  initCartPropertiesCleaner,
  isCartContainerOrDescendant,
} from '../../../app/storefront/cart-properties-cleanup';

describe('cleanupInternalCartProperties', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    document = dom.window.document;
    (global as any).document = document;
    (global as any).window = dom.window;
    (global as any).NodeFilter = dom.window.NodeFilter;
    (global as any).Node = dom.window.Node;
    (global as any).Element = dom.window.Element;
    (global as any).MutationObserver = dom.window.MutationObserver;
  });

  afterEach(() => {
    delete (global as any).document;
    delete (global as any).window;
    delete (global as any).NodeFilter;
    delete (global as any).Node;
    delete (global as any).Element;
    delete (global as any).MutationObserver;
  });

  it('removes raw text nodes and trailing <br> for leading underscore properties in legacy theme containers', () => {
    document.body.innerHTML = `
      <div class="cart-item">
        <div class="content">
          <a href="/products/headband">Wide Headband</a>
          <span class="price">$15.00</span>
          _bundle_name: Mixed 3-Pack
          <br>
          _wolfpack_bundle_runtime: {"pricingMethod":"EQUAL_DISCOUNT"}
          <br>
          _is_bundle_parent: true
          <br>
          <div class="quantity">Qty: 1</div>
        </div>
      </div>
    `;

    cleanupInternalCartProperties(document);

    const content = document.querySelector('.content')!;
    expect(content.textContent).not.toContain('_bundle_name');
    expect(content.textContent).not.toContain('_wolfpack_bundle_runtime');
    expect(content.textContent).not.toContain('_is_bundle_parent');
    expect(content.textContent).toContain('Wide Headband');
    expect(content.textContent).toContain('$15.00');
    expect(content.textContent).toContain('Qty: 1');
    expect(content.querySelectorAll('br').length).toBe(0);
  });

  it('removes wrapper element when property is inside a property wrapper', () => {
    document.body.innerHTML = `
      <ul class="cart-item__properties">
        <li class="cart-item__property">
          <span class="cart-item__property-label">_bundle_name:</span>
          <span>Mixed 3-Pack</span>
        </li>
        <li class="cart-item__property">
          <span class="cart-item__property-label">Color:</span>
          <span>Red</span>
        </li>
      </ul>
    `;

    cleanupInternalCartProperties(document);

    expect(document.body.textContent).not.toContain('_bundle_name');
    expect(document.body.textContent).toContain('Color:');
    expect(document.body.textContent).toContain('Red');
    const listItems = document.querySelectorAll('li');
    expect(listItems.length).toBe(1);
    expect(listItems[0].textContent).toContain('Color:');
  });

  it('marks a merged bundle parent before removing its internal parent property', () => {
    document.body.innerHTML = `
      <table class="cart-items">
        <tbody>
          <tr>
            <td>
              <dl>
                <div class="cart-item__property">
                  <dt>_is_bundle_parent:</dt>
                  <dd>true</dd>
                </div>
                <div class="cart-item__property">
                  <dt>Retail Price:</dt>
                  <dd>$60.00</dd>
                </div>
              </dl>
              <div class="cart-items__unit-price-wrapper">$60.00</div>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    cleanupInternalCartProperties(document);

    const row = document.querySelector('tr') as HTMLElement;
    expect(row.dataset.wpbBp).toBe('true');
    expect(row.textContent).not.toContain('_is_bundle_parent');
    expect(row.textContent).toContain('Retail Price:');
  });

  it('marks a merged bundle parent from its Function-generated bundle price property', () => {
    document.body.innerHTML = `
      <table class="cart-items">
        <tbody>
          <tr data-key="bundle-parent-key">
            <td><dl><div><dt>Bundle Price:</dt><dd>$60.00</dd></div></dl></td>
          </tr>
          <tr data-key="ordinary-line-key"><td>Ordinary product $20.00</td></tr>
        </tbody>
      </table>
    `;

    cleanupInternalCartProperties(document);

    expect((document.querySelector('[data-key="bundle-parent-key"]') as HTMLElement).dataset.wpbBp).toBe('true');
    expect((document.querySelector('[data-key="ordinary-line-key"]') as HTMLElement).dataset.wpbBp).toBeUndefined();
  });

  it('preserves public line item properties without leading underscores', () => {
    document.body.innerHTML = `
      <div class="content">
        <p>Custom Engraving: John Doe</p>
        <p>Gift Note: Happy Birthday!</p>
      </div>
    `;

    cleanupInternalCartProperties(document);

    expect(document.body.textContent).toContain('Custom Engraving: John Doe');
    expect(document.body.textContent).toContain('Gift Note: Happy Birthday!');
  });

  describe('scoped container discovery and throttling', () => {
    it('identifies cart container elements accurately', () => {
      const form = document.createElement('form');
      form.setAttribute('action', '/cart');
      expect(isCartContainerOrDescendant(form)).toBe(true);

      const drawer = document.createElement('div');
      drawer.className = 'cart-drawer';
      expect(isCartContainerOrDescendant(drawer)).toBe(true);

      const divWithDrawer = document.createElement('div');
      divWithDrawer.appendChild(drawer);
      expect(isCartContainerOrDescendant(divWithDrawer)).toBe(true);

      const carousel = document.createElement('div');
      carousel.className = 'product-carousel';
      expect(isCartContainerOrDescendant(carousel)).toBe(false);
    });

    it('coalesces multiple rapid schedule calls into one frame', () => {
      const rafMock = jest.fn();
      (global as any).window.requestAnimationFrame = rafMock;
      (global as any).window.requestIdleCallback = undefined;

      scheduleCartPropertiesCleanup();
      scheduleCartPropertiesCleanup();
      scheduleCartPropertiesCleanup();

      expect(rafMock).toHaveBeenCalledTimes(1);
    });

    it('attaches scoped observer to cart container when present', () => {
      document.body.innerHTML = `
        <div class="cart-drawer">
          <div class="content">_bundle_name: Test</div>
        </div>
        <div class="other-section"></div>
      `;

      const observeMock = jest.fn();
      (global as any).MutationObserver = jest.fn().mockImplementation(() => ({
        observe: observeMock,
        disconnect: jest.fn(),
      }));

      initCartPropertiesCleaner();

      const cartContainer = document.querySelector('.cart-drawer');
      expect(observeMock).toHaveBeenCalledWith(cartContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['open', 'class', 'aria-hidden'],
      });
    });
  });
});
