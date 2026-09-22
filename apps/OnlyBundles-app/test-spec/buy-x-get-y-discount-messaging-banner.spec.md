---
schema_version: 1
id: buy-x-get-y-discount-messaging-banner
title: Buy X Get Y Discount Messaging Guidance Banner
type: test-spec
status: active
summary: Verify PPB and FPB configure pages show the Buy X Get Y quantity guidance in the same dismissible Polaris information banner.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - admin
  - bundles
systems:
  - only-bundles
  - polaris-app-home
source_paths:
  - apps/OnlyBundles-app/app/routes/app/app.bundles.full-page-bundle.configure.$bundleId/sections/DiscountMessagingOptions.tsx
  - apps/OnlyBundles-app/app/routes/app/app.bundles.product-page-bundle.configure.$bundleId/PpbDiscountMessagingOptions.tsx
related_docs:
  - internal docs/Shopify Integration/Polaris Web Components Reference.md
tags:
  - discount-messaging
  - polaris
keywords:
  - Buy X Get Y
  - dismissible banner
---

# Test Spec: Buy X Get Y Discount Messaging Guidance Banner

**Spec ID:** buy-x-get-y-discount-messaging-banner **Created:** 2026-09-23

## Purpose

Keep the quantity-to-claim guidance consistent across PPB and FPB configure
pages using Shopify's native informational feedback component.

## Test Cases

### DiscountMessagingGuidanceBanner

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | PPB uses Buy X Get Y | `discountType=buy_x_get_y` | One dismissible `s-banner` with `tone="info"` and translated guidance | Native Polaris feedback |
| 2 | FPB uses Buy X Get Y | `discountType=buy_x_get_y` | One dismissible `s-banner` with `tone="info"` and translated guidance | Same contract as PPB |
| 3 | Another discount method is selected | `discountType=percentage_off` | Guidance banner is absent | Guidance is method-specific |

## Acceptance Criteria

- [x] PPB and FPB share the same native banner contract
- [x] The banner is informational and dismissible
- [x] Non-Buy-X-Get-Y methods do not render the guidance
- [x] All focused tests and Polaris validation pass
