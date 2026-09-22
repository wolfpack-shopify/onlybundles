---
schema_version: 1
id: ppb-post-add-redirect
title: PPB Post Add Redirect
type: test-spec
status: active
summary: Verify PPB post-add behavior stays on the product page by default and honors explicit cart or checkout redirects.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - storefront
systems:
  - product-page-bundle
source_paths:
  - apps/OnlyBundles-app/app/assets/widgets/product-page/methods/config-lifecycle-methods.ts
related_docs:
  - internal docs/Architecture/Widget Architecture.md
tags:
  - product-page-bundle
  - cart
keywords:
  - post add redirect
---

# Test Spec: PPB Post Add Redirect

**Spec ID:** ppb-post-add-redirect **Created:** 2026-07-17

## Purpose

Verify the Product Page Bundle post-add redirect handler follows the saved
Product Page redirect mode after a successful bundle add.

## Test Cases

### ProductPagePostAddRedirect
| # | Scenario | Input | Expected Output | Notes |
| --- | --- | --- | --- | --- |
| 1 | Checkout redirect | `redirect.action = "checkout"` | Browser path changes to `/checkout` after delay | Covers Redirect to Checkout |
| 2 | Cart redirect | `redirect.action = "cart"` | Browser path changes to `/cart` after delay | Covers Redirect to Cart |
| 3 | Default stay behavior | Missing action or `redirect.action = "stay"` | Product page remains open and `openCart` is not called | Prevents automatic sidecart opening |
| 4 | Merchant scripts | Redirect script and custom Product Page script configured | Redirect script executes during post-add handling | Keeps script ownership explicit |

## Acceptance Criteria

- [ ] All listed test cases pass.
