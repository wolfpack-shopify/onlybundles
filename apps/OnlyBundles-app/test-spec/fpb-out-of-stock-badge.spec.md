---
schema_version: 1
id: fpb-out-of-stock-badge
title: "Test Spec: Universal Out-of-Stock CTA Blocking Across All Templates"
type: test-spec
status: active
summary: Behavior gates for out-of-stock bundle product cards and disabled add controls across FPB and PPB templates.
last_audited: 2026-09-20
owners:
  - engineering
domains:
  - development
systems:
  - only-bundles
source_paths:
  - app/assets/widgets/full-page
  - app/assets/widgets/product-page
  - tests/unit/assets/fpb-out-of-stock-badge.test.ts
related_docs:
  - internal docs/Architecture/Widget Architecture.md
tags:
  - tdd
  - storefront
  - inventory
keywords:
  - out of stock
  - product card
  - add button
---

# Test Spec: Universal Out-of-Stock CTA Blocking Across All Templates
**Spec ID:** universal-out-of-stock-badge  **Created:** 2026-09-17  **Updated:** 2026-09-18

## Purpose
Verify that across all bundle templates (FPB Standard, Classic, Compact, Horizontal, and PPB Cascade, Grid, Modal):
1. Completely out-of-stock product cards do NOT render an out-of-stock chip badge (`.product-stock-badge--out`), avoiding clipping.
2. The card is assigned `.is-out-of-stock`.
3. The Add CTA button displays the "Out of Stock" text, has `disabled="true"` and `aria-disabled="true"`.
4. In-stock cards do not display the out-of-stock badge.
5. Clicking the Add CTA button on an out-of-stock card does not update product selection.

## Test Cases
### Universal Out of Stock Handling Across Templates
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | FPB Standard out of stock | `isVariantOutOfStock: () => true` | Card has `.is-out-of-stock`, no `.product-stock-badge--out`, Add button disabled with "Out of stock" text | FPB Standard |
| 2 | FPB Classic out of stock | Preset `CLASSIC`, `isVariantOutOfStock: () => true` | Card has `.is-out-of-stock`, no `.product-stock-badge--out`, Add button disabled with "Out of stock" text | FPB Classic |
| 3 | FPB Compact out of stock | Preset `COMPACT`, `isVariantOutOfStock: () => true` | Card has `.is-out-of-stock`, no `.product-stock-badge--out`, Add button disabled with "Out of stock" text | FPB Compact |
| 4 | FPB Horizontal out of stock | Preset `HORIZONTAL`, `isVariantOutOfStock: () => true` | Card has `.is-out-of-stock`, no `.product-stock-badge--out`, Add button disabled with "Out of stock" text | FPB Horizontal |
| 5 | PPB Cascade row out of stock | Cascade layout, `product.available = false` | Row has `.is-out-of-stock`, no `.product-stock-badge--out`, Add button disabled with "Out of Stock" text | PPB Cascade |
| 6 | PPB Grid card out of stock | Grid layout, `product.available = false` | Card has `.is-out-of-stock`, no `.product-stock-badge--out`, Add button disabled with "Out of Stock" text | PPB Grid |
| 7 | PPB Modal card out of stock | Modal layout, `product.available = false` | Card has `.is-out-of-stock`, no `.product-stock-badge--out`, Add button disabled with "Out of Stock" text | PPB Modal |

## Acceptance Criteria
- [x] All listed test cases pass
