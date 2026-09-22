---
schema_version: 1
id: discount-display-switch-accessibility
title: Discount Display Switch Accessibility Test Spec
type: test-spec
status: active
summary: Verifies accessible names for FPB and PPB discount-display switches.
last_audited: 2026-09-22
owners:
  - engineering
domains:
  - development
systems:
  - only-bundles
source_paths:
  - apps/OnlyBundles-app/app/routes/app
related_docs:
  - internal docs/Shopify Integration/Polaris Web Components Reference.md
tags:
  - accessibility
keywords:
  - s-switch
---

# Test Spec: Discount Display Switch Accessibility
**Spec ID:** discount-display-switch-accessibility  **Created:** 2026-09-22

## Purpose

Ensure every FPB and PPB discount-display switch has a programmatic accessible name while retaining the existing visible section heading.

## Test Cases

### DiscountDisplaySwitchAccessibility

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | FPB quantity-options switch renders | Quantity options enabled or disabled | Switch uses the existing quantity-options title as its accessible label | Visible title remains unchanged |
| 2 | FPB progress and messaging switches render | Discount display settings | Both switches expose non-empty accessible labels | Uses existing translated titles |
| 3 | PPB quantity-options switch renders | Quantity options enabled or disabled | Switch uses the existing quantity-options title as its accessible label | Visible title remains unchanged |
| 4 | PPB progress and messaging switches render | Discount display settings | Every rendered switch exposes a label or accessibility label | Covers the live Polaris warnings |

## Acceptance Criteria

- [x] All listed test cases pass
- [x] Shopify Polaris validation accepts the switch markup
- [x] Modified files have zero ESLint errors
- [x] No duplicate visible labels are introduced
