---
schema_version: 1
id: shopify-native-storefront-remediation-test-spec
title: "Test Spec: Shopify-Native Storefront Remediation"
type: test-spec
status: active
summary: Verifies native storefront actions, dedicated Controls delivery, event-driven integrations, and feature-gated app-embed assets.
last_audited: 2026-09-22
owners:
  - engineering
domains:
  - testing
systems:
  - only-bundles
  - shopify
source_paths:
  - apps/OnlyBundles-app/app/lib/settings-controls-runtime.ts
  - apps/OnlyBundles-app/app/assets/widgets/shared/shopify-cart-actions.ts
  - apps/OnlyBundles-app/app/storefront/app-embed.ts
related_docs:
  - internal docs/Architecture/Shopify Native Audit.md
tags:
  - tdd
  - storefront
keywords:
  - shopify actions
  - controls metafield
---

# Test Spec: Shopify-Native Storefront Remediation

**Spec ID:** shopify-native-storefront-remediation  **Created:** 2026-09-22

## Purpose

Verify that Only Bundles uses Shopify storefront actions and events, delivers Controls through an app-owned metafield, and loads only storefront features needed by the current page.

## Test Cases

### ControlsRuntime

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Build default Controls | Empty payload | Both compare-at controls are enabled | Product MSRP only |
| 2 | Build PPB Controls | Saved payload | Obsolete theme-cart selectors are absent | Product price selector remains |
| 3 | Validate scripts | Invalid merchant JavaScript | Owning stable field key receives an error | No script executes |
| 4 | Save invalid Controls | Invalid payload | HTTP 422 and no persistence or sync | Preserve submitted values |
| 5 | Sync Controls runtime | Valid payload | `$app/storefront_controls_runtime` is written | JSON size checked first |

### NativeCartActions

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Add bundle lines | Variants, properties, selling plan | `Shopify.actions.updateCart` receives native line input | No Ajax add fallback |
| 2 | Native failure | Rejected action or user errors | Existing widget failure surface receives the error | Warnings remain visible |
| 3 | Open cart | Side-cart post-add action | `Shopify.actions.openCart` is called | Shopify owns fallback navigation |
| 4 | Localized navigation | Non-root locale | Remaining cart reads and redirects preserve `Shopify.routes.root` | Absolute URLs unchanged |

### StorefrontEventsAndAssets

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Cart lines update | Successful standard event promise | One localized cart read and targeted refresh | `window.fetch` unchanged |
| 2 | Collection update | Collection quick-add enabled | Bundle links are applied after the standard event | No global body observer |
| 3 | Feature gating | Page markers and Controls settings | Only required lazy assets load once | Core remains the owner |
| 4 | Progress message | Merchant text containing HTML | Text is inert with controlled numeric emphasis | No merchant `innerHTML` |

## Acceptance Criteria

- [x] All listed test cases pass
- [x] Typecheck and scoped ESLint report zero errors
- [x] Widget assets build and pass `node --check`
- [x] Shopify app configuration and modified Liquid validate
- [ ] SIT confirms native cart behavior, localized routes, compare-at controls, and lazy asset loading
