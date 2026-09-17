# Test Spec: Checkout Bundle Title and Box Property Cleanup
**Spec ID:** checkout-bundle-title-and-box-cleanup  **Created:** 2026-09-17

## Purpose
Ensure that:
1. Merged bundle parent lines on Shopify Checkout and Cart display the canonical bundle product title (e.g. "Live Step6 QA Bundle") rather than a hardcoded "Bundle" string.
2. Storefront widgets do not append the public `Box: 1` / `Box: 2` line item property to bundle components, preventing unwanted "Box: X" labels from appearing below items in the native Shopify checkout order summary.
3. When `source_display_properties.bundle_name` is absent in `bundle-cart-transform-rs`, the transform outputs `title: None` so Shopify automatically falls back to the parent variant's canonical product title instead of forcing `"Bundle"`.

## Test Cases
### CheckoutBundleTitleAndBoxCleanup
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | PPB cart submit does not append public `Box` property | Product page cart items submitted to `buildProductPageCartFormData` | `formData` has no `Box` property on any line | Prevents "Box: 1" label in checkout |
| 2 | SDK cart items do not include `Box` property | Selections passed to `buildCartItems` in SDK | Output item properties do not contain `Box` | Clean component attributes |
| 3 | Full-page step footer items do not include `Box` property | Step selections processed in full-page cart add | Line properties do not contain `Box` | Clean component attributes |
| 4 | Display properties preserve `bundleName` in PPB | `sourceProperties` with `_bundle_display_properties` containing `bundleName` | `buildBundleDetailsDisplayProperties` returns object with `bundleName` | Propagates to `$app:bundle_details` |
| 5 | Display properties preserve `bundleName` in FPB | Full-page `sourceProperties` with `bundleName` | `buildBundleDetailsDisplayProperties` returns object with `bundleName` | Propagates to `$app:bundle_details` |
| 6 | Cart Transform uses `bundle_name` when provided | `source_display_properties.bundle_name = Some("Custom Bundle")` | `LinesMergeOperation.title = Some("Custom Bundle")` | Custom title preserved |
| 7 | Cart Transform leaves `title = None` when `bundle_name` is absent | `source_display_properties.bundle_name = None` | `LinesMergeOperation.title = None` (NOT `Some("Bundle")`) | Shopify uses parent variant title |

## Acceptance Criteria
- [ ] All listed test cases pass
- [ ] No `Box` property appended on storefront `/cart/add`
- [ ] Cart transform does not override parent product title with `"Bundle"`
- [ ] Zero ESLint errors
