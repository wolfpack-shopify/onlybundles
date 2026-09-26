---
schema_version: 1
id: ppb-preview-read-only-test-spec
title: PPB Read-Only Storefront Preview Test Spec
type: test-spec
status: verified
summary: Verifies that PPB storefront preview opens the saved product without mutating its Shopify product template.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - admin
  - storefront
systems:
  - only-bundles
  - shopify
source_paths:
  - apps/OnlyBundles-app/app/routes/app/app.bundles.product-page-bundle.configure.$bundleId/usePpbPreviewReadinessHandlers.ts
related_docs:
  - docs/plans/shopify-native-bundle-template-remediation-plan.md
tags:
  - preview
  - product-page-bundle
keywords:
  - assignProductTemplate
  - templateSuffix
---

# Test Spec: PPB Read-Only Storefront Preview
**Spec ID:** ppb-preview-read-only  **Created:** 2026-09-23

## Purpose

Ensure the product-page bundle preview uses the saved Shopify product and template state without mutating the product template during preview.

## Test Cases

### ProductPageBundlePreview

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Open a saved storefront preview | Saved bundle with a storefront product URL and valid widget placement | Preview authorization is prepared, placement is validated, and the signed storefront URL opens without an `assignProductTemplate` request | Template assignment remains owned by the explicit placement workflow |

## Acceptance Criteria

- [x] PPB Preview does not issue an `assignProductTemplate` action.
- [x] PPB Preview still records the preview event after opening the signed storefront URL.
- [x] Existing preview authorization and placement validation remain intact.
