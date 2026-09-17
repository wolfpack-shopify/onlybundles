# Test Spec: Discount Functions Consolidation
**Spec ID:** discount-functions-consolidation  **Created:** 2026-09-17

## Purpose
Consolidate the duplicate `scheduled-bundle-discount` extension into the canonical `bundle-discount-function`. Use native Shopify `startsAt`/`endsAt` datetime scheduling on `DiscountAutomaticApp` rather than running a custom Gregorian calendar cycle calculator in Wasm.

## Test Cases

### DiscountSyncAndLifecycle
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Sync scheduled bundle discount | Policy with `pricingMode: 'scheduled'`, one-time schedule | Discount node created with `functionHandle: 'bundle-discount-function'`, `startsAt` and `endsAt` matching schedule | Uses canonical discount function handle |
| 2 | Reconcile recurring subscription discount | Policy with `recurringSubscription: true` | Creates or preserves `scheduled_recurring` role with `recurringCycleLimit: 0` | Native subscription cycle limit |
| 3 | Remove bundle discount on unschedule/unpublish | `policy.pricingMode = 'standard'` or `active: false` | Deletes existing discount nodes for this bundle under `bundle-discount-function` | Cleans up orphaned discounts |
| 4 | Delete bundle cleanup | Call `removeScheduledBundleDiscounts(admin, shop, bundleId)` | Only discounts for that specific bundle under `bundle-discount-function` are deleted | Other bundles remain untouched |
| 5 | Discount function candidates scope | Bundle policy in `ppb_policy_revisions` marked with either `standard` or `scheduled` | `bundle-discount-function` generates discount candidates without error | Scope accepts scheduled mode |

## Acceptance Criteria
- [ ] All unit tests pass in `tests/unit/services/scheduled-bundle-discount.test.ts`.
- [ ] All Rust unit tests pass in `apps/OnlyBundles-app/extensions/bundle-discount-function`.
- [ ] Build script compiles `bundle-discount-function` successfully.
- [ ] Zero ESLint errors on all touched files.
