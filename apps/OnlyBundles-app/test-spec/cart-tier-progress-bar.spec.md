---
schema_version: 1
id: cart-tier-progress-bar
title: Cart Tier Progress Bar & Bundle Savings Label Defaults
type: test-spec
status: active
summary: Verify Cart Tier Progress Bar calculation, cart-page presentation, Settings Design customization, and Cart Line Bundle Savings behavior.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - storefront
  - admin
systems:
  - theme-app-extension
  - cart-transform
source_paths:
  - app/storefront/cart-tier-progress-bar.ts
  - app/assets/widgets/shared-css/app-embed-global.css
  - app/assets/widgets/shared-css/cart-tier-progress.css
  - app/lib/settings-language-runtime.ts
  - app/lib/admin-configuration-surfaces.ts
  - extensions/bundle-cart-transform-rs/src/types.rs
  - extensions/bundle-cart-transform-rs/src/merge.rs
related_docs:
  - internal docs/Architecture/Widget Architecture.md
tags:
  - storefront
  - cart
  - progress-bar
keywords:
  - cart tier progress bar
  - bundle savings
  - theme non suppression
---

# Test Spec: Cart Tier Progress Bar & Bundle Savings Defaults

**Spec ID:** cart-tier-progress-bar **Created:** 2026-09-17

## Purpose

Verify that:
1. Cart line discount display label defaults to "Bundle Savings" while preserving merchant customization in Settings.
2. Cart Transform emits "Bundle Savings" attribute when discount > 0 and omits it when discount == 0.
3. Merged bundle parents hide the redundant theme unit-price block while retaining the native line total.
4. Cart Tier Progress Bar calculates progress accurately from cart bundle lines, renders on the full cart page, and leaves theme-owned cart drawers untouched.
5. Settings -> Design exposes customization and live preview for the Cart Tier Progress Bar.

## Test Cases

### BundleSavingsLabelDefaults

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Default language runtime | Empty overrides | `bundleDiscountDisplayLabel` is `"Bundle Savings"` | Updated default |
| 2 | Merchant custom label override | `{ bundleDiscountDisplayLabel: "You Save" }` | Uses `"You Save"` | Merchant config preserved |
| 3 | Cart Transform default label | Unspecified you_save label | Label is `"Bundle Savings"` | Matches storefront |
| 4 | Cart Transform with positive discount | discount > 0 | `Bundle Savings: $XX (YY%)` attribute present | Emits savings |
| 5 | Cart Transform with zero discount | discount == 0 | No savings attribute present | Clean cart line |

### CartTierProgressBarEngine

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Cart with bundle below first tier | 2 items in 3-item tier | Progress: 66%, Message: "Add 1 more to unlock 10% off" | Next tier prompt |
| 2 | Cart with bundle at max tier | 5 items in 5-item tier | Progress: 100%, Message: "You've unlocked 20% off!" | Completion state |
| 3 | Cart with no bundle items | Standard catalog items | Returns null / hidden | Non-intrusive |
| 4 | Cart quantity update | Quantity changed via AJAX | Progress bar recalculates and updates | Reactive update |

### CartSurfacePresentation

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Side cart drawer | Tier-progress state and a theme-owned drawer | No app-owned progress element is mounted | Preserves the theme's drawer structure |
| 2 | Full cart page | Progress bar mounted in the cart-page container | Retains the horizontal cart-page presentation | Progress remains available outside the drawer |

## Acceptance Criteria

- [ ] All listed test cases pass
- [ ] Zero ESLint errors
- [ ] Theme-owned cart drawers remain structurally untouched
