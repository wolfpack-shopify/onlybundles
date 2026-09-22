---
schema_version: 1
id: cart-progress-disabled-state
title: Cart Progress Disabled State
type: test-spec
status: active
summary: Verify the cart discount progress bar fails closed when participating bundle metadata disables or omits progress display.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - storefront
  - bundles
systems:
  - theme-app-extension
  - only-bundles
source_paths:
  - apps/OnlyBundles-app/app/storefront/cart-tier-progress-bar.ts
  - apps/OnlyBundles-app/app/assets/widgets/shared/engine/cart-lines.ts
related_docs:
  - internal docs/Architecture/Widget Architecture.md
tags:
  - cart
  - discount-progress
keywords:
  - disabled progress bar
  - cart metadata
---

# Test Spec: Cart Progress Disabled State

**Spec ID:** cart-progress-disabled-state **Created:** 2026-09-23

## Purpose

Prevent the cart page from mounting app-owned discount progress when the
merchant has disabled that feature, including mixed carts and payloads without
an explicit progress configuration.

## Test Cases

### CartProgressDisabledState

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Bundle disables progress | `progressBar.enabled=false` | Cart-line metadata retains an explicit disabled marker | Prevents stale enabled lines from taking ownership |
| 2 | Progress configuration is absent | Pricing rules without `progressBar` | Metadata defaults to `enabled=false` | Fail-closed canonical default |
| 3 | Cart contains enabled and disabled bundle metadata | At least one participating line has `enabled=false` | No cart progress state is produced | Avoids misleading global progress |

## Acceptance Criteria

- [x] Both cart metadata extractors retain explicit disabled state
- [x] Missing progress configuration does not enable the feature
- [x] Mixed carts do not mount the global progress bar
- [x] Focused tests, widget build, typecheck, and generated syntax checks pass
