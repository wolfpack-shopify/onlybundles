import { join } from 'path';

export function createTargets(rootDir) {
  return [
    {
      source: join(rootDir, 'app/assets/widgets/shared-css/app-embed-global.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-bootstrap.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/full-page-css/bundle-widget-full-page.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-full-page.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/full-page-css/shared/mobile-summary-footer.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-full-page-mobile-summary.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/full-page-css/shared/responsive-layout.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-full-page-responsive.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/full-page-css/templates/side-footer-standard.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-full-page-standard.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/full-page-css/templates/side-footer-classic.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-full-page-classic.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/full-page-css/templates/side-footer-compact.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-full-page-compact.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/full-page-css/templates/side-footer-horizontal.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-full-page-horizontal.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/product-page-css/bundle-widget.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/product-page-css/templates/inpage-cascade.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-product-page-cascade.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/product-page-css/templates/inpage-grid.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-product-page-grid.css'),
    },
    {
      source: join(rootDir, 'app/assets/widgets/product-page-css/templates/modal-slots.css'),
      target: join(rootDir, 'extensions/bundle-builder/assets/bundle-widget-product-page-modal.css'),
    },
  ];
}
