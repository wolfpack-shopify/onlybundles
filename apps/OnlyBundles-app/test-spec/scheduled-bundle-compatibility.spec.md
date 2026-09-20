---
schema_version: 1
id: scheduled-bundle-compatibility-test-spec
title: Scheduled Bundle Compatibility Test Spec
type: test-spec
status: active
summary: Tests the Admin and save-time guard for schedules that require hidden merged-component facts.
last_audited: 2026-09-20
owners:
  - engineering
domains:
  - testing
systems:
  - only-bundles
source_paths:
  - apps/OnlyBundles-app/app/lib/scheduled-bundle-compatibility.ts
  - apps/OnlyBundles-app/extensions/bundle-cart-transform-rs/src/merge.rs
  - apps/OnlyBundles-app/extensions/bundle-discount-function/src/candidates.rs
related_docs:
  - internal docs/Architecture/Cart Transform Function.md
tags:
  - scheduling
keywords:
  - scheduled bundle compatibility
---

# Test Spec: Scheduled Bundle Compatibility
**Spec ID:** scheduled-bundle-compatibility  **Created:** 2026-09-20

## Purpose

Prevent merchants from scheduling bundle discounts that Shopify cannot calculate after Cart Transform merges the base component lines.

## Test Cases

### ScheduledBundleCompatibility

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Visible parent facts | Amount-based percentage, fixed amount, or fixed bundle price rules | Scheduling remains available | The Discount Function can use the merged parent subtotal. |
| 2 | Lowest-priced BXY | Buy-X-get-Y applied to the lowest-priced component | Scheduling unavailable | Individual component prices are hidden after merge. |
| 3 | Quantity tier | A pricing rule selected by component quantity | Scheduling unavailable | The merged parent does not expose the selected component count. |
| 4 | Hidden identity tier | Pricing rule targets component products, variants, or groups | Scheduling unavailable | The merged parent does not expose component identity. |
| 5 | Add-on hidden dependency | Add-on eligibility or tier rules depend on component quantity, weight, or groups | Scheduling unavailable | Add-ons remain visible, but their qualifying base facts are hidden. |
| 6 | Variant-triggered gift | Gift eligibility depends on selected base variants | Scheduling unavailable | The gift line cannot prove the hidden trigger variant. |
| 7 | Per-component allocation | A rule selects or allocates savings to individual components | Scheduling unavailable | Individual target lines no longer exist downstream. |
| 8 | Crafted scheduled save | An incompatible bundle submits a non-always schedule | Save validation returns an Offer scheduling issue | Server validation owns the final guard. |
| 9 | Compatible scheduled base | Amount-based scheduled bundle | Base components merge without a Cart Transform price adjustment | Shopify's native discount window gates the saving. |
| 10 | Scheduled add-on | Compatible amount-based add-on tier | Base components merge; add-on remains separate and receives its own eligible discount | The parent and add-on use authoritative app-owned policies. |
| 11 | Ordinary add-on | Non-scheduled bundle with an add-on | Components remain separate for direct downstream validation | Existing add-on eligibility remains authoritative. |
| 12 | Inactive schedule | Native scheduled discount is inactive | Parent remains purchasable at regular price without a fabricated Function warning | Shopify validation messages are blocking errors. |

## Acceptance Criteria

- [ ] FPB and PPB use the same compatibility decision.
- [ ] One-time and recurring schedule options are disabled when incompatible.
- [ ] A blue inline information banner explains why scheduling is unavailable.
- [ ] Merchants can still select Always active to remove an existing incompatible schedule.
- [ ] Server-side validation rejects a crafted incompatible scheduled save.
- [ ] Compatible amount-based configurations can still be scheduled.
- [ ] Compatible scheduled base components merge into the dedicated parent.
- [ ] Add-on and gift lines remain separate from the parent merge.
- [ ] Scheduled pricing is applied only by the native scheduled Discount Function.
- [ ] Ordinary bundles with add-ons continue to retain component lines.
