---
schema_version: 1
id: storefront-cart-stability-and-ppb-parent-media
title: Storefront Cart Stability and PPB Parent Media
type: test-spec
status: active
summary: Verify theme-owned cart drawers remain untouched, PPB add-to-cart stays in place by default, and PPB parents receive placeholder media when missing.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - storefront
  - bundles
systems:
  - theme-app-extension
  - only-bundles
source_paths:
  - apps/OnlyBundles-app/app/storefront/cart-tier-progress-bar.ts
  - apps/OnlyBundles-app/app/assets/widgets/product-page/methods/config-lifecycle-methods.ts
  - apps/OnlyBundles-app/app/services/bundles/bundle-parent-product.server.ts
related_docs:
  - internal docs/Architecture/Widget Architecture.md
tags:
  - cart
  - product-page-bundle
keywords:
  - sidecart
  - parent placeholder
---

# Test Spec: Storefront Cart Stability and PPB Parent Media

**Spec ID:** storefront-cart-stability-and-ppb-parent-media **Created:** 2026-09-23

## Purpose

Protect theme cart drawer ownership, keep buyers on the PPB product page after
adding a bundle unless an explicit redirect is selected, and ensure existing
PPB parent products without media receive the canonical Only Bundles placeholder.

## Test Cases

### StorefrontCartStability

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Theme cart drawer is present | Tier-progress state | No app-owned progress element is mounted in the drawer | Leaves drawer structure theme-owned |
| 2 | Full cart page is present | Tier-progress state | Progress element is mounted in the cart-page container | Retains the cart-page feature |
| 3 | PPB default post-add behavior | Missing or stay action | Current product page remains open and `openCart` is not called | No automatic sidecart |
| 4 | PPB explicit redirect | Checkout or cart action | Buyer is redirected to the selected destination | Preserves merchant-selected redirects |

### PpbParentMedia

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Existing PPB parent has no media | Empty Shopify media connection | Canonical placeholder media is added | Matches FPB parent contract |
| 2 | Existing PPB parent has merchant media | Non-empty Shopify media connection | Existing media is preserved | No overwrite |
| 3 | Existing PPB placeholder failed processing | Every returned media node has Shopify status `FAILED` | Canonical placeholder media is retried with the supported PNG source | Does not treat failed media as valid product media |

## Acceptance Criteria

- [x] All listed test cases pass
- [x] Zero ESLint errors in modified source and tests
- [x] Storefront widget bundles build and pass syntax checks
- [x] SIT PPB add does not open the sidecart
- [x] SIT sidecart structure remains theme-owned after FPB and PPB additions
