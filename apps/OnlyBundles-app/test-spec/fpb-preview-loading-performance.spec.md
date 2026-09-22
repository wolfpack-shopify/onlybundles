---
schema_version: 1
id: fpb-preview-loading-performance-test-spec
title: "Test Spec: FPB Preview Loading Performance"
type: test-spec
status: active
summary: Verifies read-only preview preparation and Shopify-hosted FPB storefront bootstrap behavior.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - development
systems:
  - only-bundles
  - shopify
source_paths:
  - apps/OnlyBundles-app/app/routes/app/shared/storefront-sync-action.server.ts
  - apps/OnlyBundles-app/app/routes/root/wpb.$bundleId.tsx
  - apps/OnlyBundles-app/app/services/fpb-storefront-runtime.server.ts
related_docs:
  - internal docs/Architecture/FPB Host Evaluation.md
tags:
  - fpb
  - performance
keywords:
  - preview
  - storefront-runtime
---

# Test Spec: FPB Preview Loading Performance
**Spec ID:** fpb-preview-loading-performance  **Created:** 2026-09-22

## Purpose

Protect the canonical read-only preview path and the Shopify-hosted FPB runtime/configuration bootstrap.

## Test Cases

### PreviewPreparation

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Prepare FPB preview | Existing FPB with a public number | Signed canonical proxy URL; no storefront sync | Read-only path |
| 2 | Prepare PPB preview | Existing PPB | Bound preview token; no storefront sync | Read-only path |
| 3 | Missing FPB public number | Existing FPB without public number | Compact failure response | No fabricated fallback |
| 4 | Prepare route fails | Non-2xx resource response | One request and surfaced error | No configure-route fallback |

### FpbStorefrontRuntime

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Build runtime | Full-page Design and Language settings | Versioned locale snapshots and loading screen | No Controls duplication |
| 2 | Sync runtime | Valid Admin client | `$app.fpb_storefront_runtime` written with `metafieldsSet` | Shopify owns delivery |
| 3 | Oversized runtime | Payload over 128KB | Reject before Admin mutation | Shopify JSON limit |

### FpbProxyPage

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Active bundle | Matching Shopify `bundle_ui_config` serialized through Storefront `Metafield.value` | Parsed Liquid response with inline snapshot and cache headers | Storefront does not expose Admin `jsonValue` |
| 2 | Draft bundle | Valid bound preview token | Liquid response with private no-store cache | Server-authorized preview |
| 3 | Missing, mismatched, or template-less snapshot | Missing/malformed/wrong bundle config or missing explicit FPB template/preset | 503 response | Fail before widget bootstrap instead of rendering an unscoped layout |
| 4 | Restricted offer | Invalid specific-link, schedule, or country decision | 404 response | Preserve server authorization |

### FpbTemplateSave

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Save an allowed FPB template | Explicit `FBP_SIDE_FOOTER` template and supported preset | Persist selection and invoke the shared Shopify storefront sync | Keeps `bundle_ui_config` authoritative |
| 2 | Shopify storefront sync fails | Valid template save followed by sync rejection | Reject the action | Never report a saved storefront state that Shopify does not serve |

## Acceptance Criteria

- [x] All listed test cases pass
- [x] Preview preparation performs no storefront synchronization
- [x] FPB startup performs no language-settings or bundle JSON fetch
- [x] FPB startup rejects Shopify snapshots without an explicit supported template and preset
- [x] FPB template saves synchronize the Shopify-hosted bundle snapshot before reporting success
- [x] Generated storefront assets parse successfully
- [x] Modified source files lint with zero errors
