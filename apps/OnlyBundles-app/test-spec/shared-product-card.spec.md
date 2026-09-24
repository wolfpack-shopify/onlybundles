---
schema_version: 1
id: shared-product-card
title: Shared Product Card Contract Test Spec
type: test-spec
status: active
summary: Behavior coverage for the shared FPB and PPB product-card renderer, including conditional variant rows and stable actions.
last_audited: 2026-09-24
owners:
  - engineering
domains:
  - storefront
  - testing
systems:
  - only-bundles
  - shopify
source_paths:
  - apps/OnlyBundles-app/app/assets/widgets/shared/components/product-card.ts
  - apps/OnlyBundles-app/tests/unit/assets/shared-product-card.test.ts
related_docs:
  - internal docs/Architecture/Product Card Layout Contract.md
  - docs/plans/shopify-native-bundle-template-remediation-plan.md
tags:
  - product-card
  - storefront
  - unit-tests
keywords:
  - FPB
  - PPB
  - variant-row
  - selection-state
---

# Shared Product Card Contract Test Spec

## Purpose

Create the Loop 4 shared product-card primitive before migrating templates.

## Test Cases

### SharedProductCard
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Renders unselected card | product, quantity `0`, mode `grid` | stable `data-bw-product-card` root, media/title/price/action regions, add button in action region | No selected overlay layout dependency |
| 2 | Renders selected card | product, quantity `2` | same action region contains quantity controls instead of add button | Add and qty swap inside same reserved area |
| 3 | Renders row mode | product, mode `row` | root has `bw-product-card--mode-row` | Needed for PPB List/FPB Horizontal |
| 4 | Renders variant row | product with `parentTitle` and non-default `variantTitle` | title row uses parent title, dedicated variant row renders variant text | FPB expanded variants need divider row |
| 5 | Preserves selected-card regions | variant product with quantity `1` | selected class, variant row, price row, and expanded action region all remain present | Price/action stability when selected |
| 6 | Suppresses empty/default variant row | default or missing variant title | no variant row marker | Avoids blank divider bands |
| 7 | Does not split ordinary hyphenated titles | title `Pre-order - Limited Edition` without variant metadata | full title remains in title row, no variant row | Avoids false-positive variant inference |
| 8 | Escapes merchant/product text | product title with HTML | escaped title and alt text | Prevents innerHTML injection |
| 9 | Normalizes product image URLs | product with imageUrl, image, featuredImage, images array, and duplicates | ordered unique image URL list | Shared card and modal use the same multi-image data source |
| 10 | Quantity control supports disabled increase | quantity input with `increaseDisabled` | plus button has `disabled aria-disabled="true"` | Stock/rule clamp compatibility |

### WidgetBuildSharedModules
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Build script inlines shared product-card modules | `scripts/build-widget-bundles.js` | `quantity-control.js` before `product-card.js` in widget shared modules | Product card imports quantity control |

## Acceptance Criteria

- [x] Product card and quantity control tests pass.
- [x] Build module inclusion test passes.
- [x] Shared product-card tests cover one meaningful variant row in selected and unselected cards.
- [x] Shared product-card tests prove default and missing variants render no variant row.
- [ ] Browser QA confirms the conditional row owns its divider without changing card height or alignment.
