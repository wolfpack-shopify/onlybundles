---
schema_version: 1
id: shopify-native-audit
title: Shopify-Native Storefront Audit
type: architecture
status: active
summary: Verified Shopify-native decisions and remediation status for Only Bundles storefront controls, cart actions, app embeds, and theme integration.
last_audited: 2026-09-22
owners:
  - engineering
domains:
  - architecture
  - shopify
systems:
  - only-bundles
  - storefront
source_paths:
  - apps/OnlyBundles-app/app/storefront/app-embed.ts
  - apps/OnlyBundles-app/app/storefront/settings-controls.ts
  - apps/OnlyBundles-app/app/assets/widgets/shared/shopify-cart-actions.ts
  - apps/OnlyBundles-app/app/assets/widgets/shared/storefront-path.ts
  - apps/OnlyBundles-app/app/services/storefront-controls-runtime.server.ts
  - apps/OnlyBundles-app/extensions/bundle-builder/blocks/bundle-app-embed.liquid
related_docs:
  - internal docs/Architecture/Widget Architecture.md
  - internal docs/Shopify Integration/Metafields.md
tags:
  - audit
  - shopify-native
keywords:
  - Shopify actions
  - app embed
  - storefront controls
  - cart lifecycle
---

# Shopify-Native Storefront Audit

This is the current, feature-aware audit. Merchant-authored JavaScript and CSS
are intentional Settings -> Controls capabilities; they are not defects merely
because the app executes or installs them. The controls are validated on save,
delivered from an app-owned Shopify shop metafield, and run only when enabled.

## Remediated findings

| Area | Canonical decision | Current contract |
| --- | --- | --- |
| Cart writes | Use Shopify storefront actions | FPB, PPB, and SDK call `Shopify.actions.updateCart`; cart drawers use `Shopify.actions.openCart`. The legacy Ajax/FormData path, browser lock, and per-variant remote preflight are removed. |
| Cart lifecycle | Subscribe to Shopify events | Progress, property cleanup, and merchant cart integration react to `shopify:cart:view`, `shopify:cart:lines-update`, and section load. No runtime patches `window.fetch` or observes the whole document body. |
| Cart property cleanup | Limit custom behavior to the demonstrated theme gap | Liquid detects existing private properties. Cleanup scans only known cart containers, is event-scoped, and preserves public properties. |
| Settings delivery | Use app-owned shop metafields | `$app.storefront_controls_runtime` is the single Controls snapshot. Liquid reads `.value`; storefront code does not fetch a duplicate settings endpoint. |
| FPB bootstrap | Read published state from Shopify | The proxy route keeps authorization in a narrow database lookup, then reads `$app.bundle_ui_config` and `$app.fpb_storefront_runtime` through Shopify's authenticated Storefront client. The widget has no language or bundle JSON fallback. |
| FPB first-load JavaScript | Defer interaction-only code | Product-modal UI and DOMPurify are emitted as a separate theme-extension asset and loaded on first rich-detail or review-badge use. |
| Preview | Keep preview preparation read-only | Preview mints a bundle-bound token and canonical URL without invoking save-time storefront synchronization. |
| Metafield definitions | Prefer declarative app config | Shop-owned FPB runtime and policy definitions live in both TOMLs. Shopify CLI 4.8.0 rejects `product_variant` configuration sections for these app configs, so the six fixed variant-owned definitions remain in one narrow Admin provisioning operation until that validated platform gap closes. |
| App-embed payload | Load only applicable behavior | The small core loads product, controls, and cart feature bundles only for matching page/runtime conditions. |
| Collection quick add | Scope discovery to collections | `/api/bundle-links` returns bundle navigation links only and is requested only on collection pages when redirect controls are enabled. |
| Theme cart integration | Prefer Shopify actions over selectors | PPB theme-cart selectors were removed. The supported theme-cart path uses `openCart`; merchant-provided custom integration remains an explicit Controls feature. |
| Inventory | Trust hydrated Shopify variant state | Add eligibility uses the already hydrated buyer-context variant availability. It does not make a second pre-cart availability request. |
| Market/language paths | Respect the Shopify route root | App-owned cart, checkout, discount, product, and bundle navigation use `Shopify.routes.root`. |
| Compare-at price | Keep it a layout control | Landing and Product Page layouts each expose `Show Compare-at Prices`, default on. The control governs product MSRP only; bundle discount totals remain independent. |
| Progress messages | Treat merchant values as text | Progress copy is built from text nodes with only app-controlled emphasis elements; merchant text is never assigned as HTML. |
| Merchant scripts | Validate before persistence | Invalid enabled script syntax returns field-owned Polaris errors and prevents save or metafield synchronization. |

## Intentional custom boundaries

- FPB and PPB selection, pricing presentation, eligibility, and bundle metadata
  remain app behavior because Shopify does not provide the complete merchant
  configuration surface.
- Merchant theme/cart scripts remain supported because they are explicit
  Controls features. They are not fallback chains for Shopify behavior.
- Targeted private-property cleanup remains for themes that visibly render
  private line attributes despite Shopify conventions.
- Signed app-proxy routes remain appropriate where the app must make a
  shop-scoped eligibility or catalog decision that Liquid cannot supply.

## Verification rule

Do not classify code as over-engineered until its consumers are traced through
Admin controls, Shopify-hosted metafields, Liquid delivery, generated assets,
and storefront behavior. A platform replacement is valid only when it preserves
the merchant feature and Shopify documents the replacement contract.
