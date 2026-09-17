---
schema_version: 1
id: checkout-ui-total-savings
title: Checkout UI Total Savings Test Spec
type: test-spec
status: active
summary: Defines checkout total-savings behavior for native discounts, order-level allocations, and transformed bundle lines.
last_audited: 2026-09-16
owners:
  - engineering
domains:
  - checkout
systems:
  - bundle-checkout-ui
source_paths:
  - extensions/bundle-checkout-ui/src/Checkout.tsx
related_docs:
  - internal docs/Architecture/Shopify Native Audit.md
tags:
  - checkout
  - discounts
  - savings
keywords:
  - total savings
  - checkout extension
  - discount allocations
---

# Test Spec: Checkout UI Total Savings
**Spec ID:** checkout-ui-total-savings  **Created:** 2026-06-30  **Updated:** 2026-09-16

## Purpose
Accurately calculate and format total savings in the Checkout UI extension. Seamlessly combine line-level bundle discounts and checkout/order-level discounts (e.g. promo codes, automatic order discounts) without under-reporting savings via lossy `Math.max`, while deduplicating mirrored allocations when Shopify mirrors line discounts at the cart root.

## Test Cases
### TotalSavingsExtension
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | No savings | Empty line and checkout discounts | Returns `0` (renders `null`) | Avoids noise on undiscounted carts |
| 2 | Native line discount only | Line allocation $82.90, checkout allocation $82.90 | $82.90 | Clean single discount |
| 3 | Disallowed attributes | `_bundle_total_savings_cents` without native allocation | Returns `0` | Ignores private Cart Transform attributes |
| 4 | Parent retail price | `Retail Price: $2,606.00` | Returns `0` | Disregards parent placeholder differences |
| 5 | Public price fallback + discount | Retail price + native line allocation $10 | Returns $10 | Native discount is authoritative |
| 6 | Transformed bundle + add-on | Line discount $30 + bundle savings attribute | Returns $30 | Uses native discount only |
| 7 | Mirrored identical allocation | Line allocation $30 and checkout allocation $30 | Returns $30 | Deduplicates mirrored allocations |
| 8 | Combined line + order code | Line discount $20 (`"Bundle 20%"`) + order code $10 (`"SAVE10"`) | Returns $30 | Correctly sums combined discounts |
| 9 | Combined line + order automatic | Line discount $25 (`"Tier Discount"`) + order auto $15 (`"Summer Sale"`) | Returns $40 | Both discounts counted |
| 10 | Currency formatting | 82.9 INR / 1000 JPY | `₹82.90` / `¥1,000` | Currency-native formatting |

## Acceptance Criteria
- [ ] All listed test cases pass
- [ ] 0 ESLint errors
- [ ] Verified in Chrome QA on dev tunnel
