---
schema_version: 1
id: category-product-picker-variant-preselection-test-spec
title: Category Product Picker Variant Preselection Test Spec
type: test-spec
status: verified
summary: Verifies that reopening a category product picker preserves the exact selected Shopify product variants.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - testing
systems:
  - only-bundles
source_paths:
  - apps/OnlyBundles-app/app/routes/app/_shared/bundle-configure/CommonStepCategoryAccordion.tsx
  - apps/OnlyBundles-app/tests/unit/routes/category-product-picker-variant-preselection.test.ts
related_docs: []
tags:
  - resource-picker
  - variants
keywords:
  - selectionIds
  - product variants
---

# Test Spec: Category Product Picker Variant Preselection
**Spec ID:** category-product-picker-variant-preselection  **Created:** 2026-09-23

## Purpose

Ensure reopening Shopify's product resource picker preserves the exact product variants selected for a step category.

## Test Cases

### CategoryProductPickerVariantPreselection

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Reopen the product picker for a category containing a partially selected product | One product with two selected variant GIDs | `shopify.resourcePicker` receives the product GID with only those two variant GIDs in `selectionIds` | Uses Shopify's native product resource picker contract |

## Acceptance Criteria

- [x] Reopening the picker preselects only the category's persisted variants.
- [x] The picker remains Shopify's native `resourcePicker` with no fallback or compatibility path.
- [x] The focused behavior test passes for the shared FPB/PPB category surface.
