---
schema_version: 1
id: css-asset-build-test-spec
title: CSS Asset Build Test Spec
type: test-spec
status: active
summary: Verifies that source CSS imports are assembled into readable Shopify theme-extension assets without project-side minification.
last_audited: 2026-09-24
owners:
  - engineering
domains:
  - storefront
systems:
  - asset-pipeline
source_paths:
  - apps/OnlyBundles-app/scripts/build-css-assets.js
  - apps/OnlyBundles-app/scripts/build-css-assets/css-imports.js
  - apps/OnlyBundles-app/scripts/build-css-assets/targets.js
related_docs:
  - internal docs/Operations/Build Process.md
tags:
  - css
  - build
keywords:
  - theme-app-extension
  - css-imports
---

# Test Spec: CSS Asset Build

**Spec ID:** css-asset-build
**Created:** 2026-09-24

## Purpose

Keep Shopify theme-extension CSS deployable while relying on Shopify's CDN for
delivery minification.

## Test Cases

### CSS asset builder

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Resolve a local import | Source CSS importing another source file | Imported CSS is assembled into the output | No runtime CSS imports between extension assets |
| 2 | Preserve readable CSS | Formatted source CSS with a comment | Formatting and comment remain present | The repository does not minify CSS |
| 3 | Classify CSS source changes | A staged storefront CSS source | Pre-commit plan requests the CSS build | Generated assets stay current |

## Acceptance Criteria

- [x] Focused tests pass.
- [x] Generated extension CSS is readable and contains resolved local imports.
- [x] The pre-commit hook runs the CSS builder for affected sources.
