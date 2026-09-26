---
schema_version: 1
id: cart-transform-fail-closed-validation
title: Cart Transform Graceful-Degradation Activation and Final-WASM Gate
type: test-spec
status: active
summary: Verify CartTransform activation degrades gracefully and the canonical build executes Shopify's final optimized WASM.
last_audited: 2026-09-25
owners:
  - engineering
domains:
  - checkout
systems:
  - cart-transform
source_paths:
  - app/services/cart-transform-service.server.ts
  - scripts/build-and-verify-cart-transform.mjs
  - extensions/bundle-cart-transform-rs/tests/fixtures/final-wasm-ordinary-cart.json
  - extensions/bundle-cart-transform-rs/tests/fixtures/final-wasm-valid-bundle.json
related_docs:
  - internal docs/Architecture/Cart Transform Function.md
tags:
  - shopify-function
  - pricing-safety
keywords:
  - cart transform timeout
  - graceful degradation
  - final WASM
  - blockOnFailure
---

# Test Spec: Cart Transform Graceful-Degradation Activation and Final-WASM Gate

**Spec ID:** cart-transform-fail-closed-validation  **Created:** 2026-07-14

## Purpose

Prevent a Cart Transform runtime failure from blocking all shop cart operations,
and prevent a non-executable Shopify-processed WASM artifact from passing the
canonical build command. The stable historical spec ID is retained.

## Test Cases

### CartTransformService

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | New transform activation | No CartTransform exists | Create with `blockOnFailure: false` | Function failure does not block ordinary cart operations. |
| 2 | Compliant existing transform | Rust transform has `blockOnFailure: false` | Reuse without recreation | Idempotent retry. |
| 3 | Blocking existing transform | Rust transform has `blockOnFailure: true` | Delete and recreate with `blockOnFailure: false` | Repairs the outage-amplifying registration. |
| 4 | Stale transform | Transform points to another Function | Delete and recreate with `blockOnFailure: false` | Preserves existing replacement behavior. |
| 5 | Blocking transform deletion fails | Delete returns an error | Return failure without creating | Do not leave two transforms or report setup success. |
| 6 | Creation fails | No transform exists and create returns an error | Return failure | Do not report setup success. |

### Final-WASM build gate

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Ordinary Shopify cart | One normal product line | Successful execution with no operations | Detects unconditional traps without transforming unrelated carts. |
| 2 | Valid bundle | Published policy and three eligible units | Successful execution with a `linesMerge` operation | Proves the optimized artifact still performs bundle work. |
| 3 | Artifact size | Shopify-processed WASM | At most 256,000 bytes | Checks the deployable artifact, not raw Cargo output. |

## Acceptance Criteria

- [x] Every newly created CartTransform sets `blockOnFailure: false`.
- [x] Existing blocking transforms are repaired idempotently.
- [x] Existing compliant transforms and normal successful pricing behavior remain unchanged.
- [x] `npm run build:cart-transform` executes the final optimized WASM against ordinary-cart and valid-bundle fixtures.
