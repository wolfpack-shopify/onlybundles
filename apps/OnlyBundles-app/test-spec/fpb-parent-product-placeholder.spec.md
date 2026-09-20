---
schema_version: 1
id: fpb-parent-product-placeholder
title: FPB Parent Product Placeholder
type: test-spec
status: active
summary: Verify that FPB parent products receive the canonical placeholder image when Shopify reports no existing product media.
last_audited: 2026-09-20
owners:
  - engineering
domains:
  - storefront
  - bundles
systems:
  - only-bundles
  - shopify
source_paths:
  - apps/OnlyBundles-app/app/services/bundles/bundle-parent-product.server.ts
  - apps/OnlyBundles-app/app/services/bundles/storefront-sync.server.ts
related_docs:
  - apps/OnlyBundles-app/test-spec/parent-product-parity.spec.md
tags:
  - fpb
  - product-media
keywords:
  - placeholder
  - parent-product
---

# Test Spec: FPB Parent Product Placeholder

**Spec ID:** fpb-parent-product-placeholder  **Created:** 2026-09-20

## Purpose

Ensure an FPB parent product has product media for cart and checkout presentation while preserving merchant-selected media.

## Test Cases

### BundleParentProductService

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Existing FPB parent has no media | Shopify returns an empty media connection | Add the canonical placeholder with `productUpdate` | Sync repairs older FPB parents |
| 2 | Existing FPB parent has merchant media | Shopify returns at least one media node | Do not add placeholder media | Merchant product media remains authoritative |
| 3 | New FPB parent | Parent is created through `productCreate` | Include the canonical placeholder in the create mutation | Existing shared creation behavior |
| 4 | Deployment/general bundle sync | Existing FPB is synchronized | Pass the app origin needed to build the placeholder URL | Allows environment-specific backfill |

## Acceptance Criteria

- [x] Focused parent-product and storefront-sync tests pass.
- [x] Scoped ESLint reports zero errors.
- [x] The FPB cart line displays its parent product image in SIT.
