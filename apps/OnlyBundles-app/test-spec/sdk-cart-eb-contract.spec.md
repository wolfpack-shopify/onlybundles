---
schema_version: 1
id: sdk-cart-eb-contract
title: SDK Cart Native Add & EB Contract
type: test-spec
status: active
summary: Verifies SDK-mode product-page bundles emit canonical Shopify 1-step add-to-cart requests while maintaining clean line grouping properties.
last_audited: 2026-09-17
owners:
  - engineering
domains:
  - storefront
  - cart
systems:
  - sdk
  - cart-transform
source_paths:
  - apps/OnlyBundles-app/app/assets/sdk/cart.ts
related_docs:
  - internal docs/Architecture/Cart Transform Function.md
tags:
  - sdk
  - cart
keywords:
  - addBundleToCart
  - buildCartItems
  - 1-step add
---

# Test Spec: SDK Cart Native Add & EB Contract
**Spec ID:** sdk-cart-eb-contract  **Issue:** [eb-storefront-parity-1]  **Created:** 2026-06-02

## Purpose
Verify SDK-mode product-page bundles emit the same EB-compatible storefront cart contract and execute single-operation native Shopify `POST /cart/add.js` calls without intermediate runtime token or cart metafield waterfalls.

## Test Cases
### buildCartItems
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Selected products are converted to EB cart line properties | SDK state with two selected products | Lines include `Box`, `_bundleName`, `_wolfpackProductBundle:OfferId`, `_wolfpackProductBundle:prodQty` | Private `_bundle_id`, `_bundle_name`, and `_step_index` are absent |
| 2 | One add operation shares one offer-session key | Two selected products in one call | Both `_wolfpackProductBundle:OfferId` values share `{offerId}_{sessionKey}` and use item indexes | Matches EB PPB grouping |
| 3 | Numeric offer IDs are normalized | `offerId: "894502"` | `_wolfpackProductBundle:OfferId` starts with `MIX-894502_` | Avoids hardcoded template assumptions |
| 4 | Bundle details metadata is generated | Discounted SDK state | Display properties include `Box`, `Items`, `Retail Price`, `You Save` | Clean metadata format |

### addBundleToCart
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Directly submits clean Shopify component lines via single POST /cart/add.js | Valid state and selection | Exactly 1 request to `/cart/add.js` with JSON `{ items }` containing clean grouping properties, emits `wbp:cart-success` | Eliminates 5-step waterfall |
| 2 | No calls to intermediate proxy or cart endpoints | Valid state | 0 calls to `cart-transform-runtime-token`, `/cart.js`, `/cart/update.js`, or `cart-bundle-details` | 1-step native addition |
| 3 | Cart add failure handling | `/cart/add.js` returns HTTP 422 with error message | Emits `wbp:cart-failed` with parsed error message | Non-throwing clean event |
| 4 | Client-side validation failure | `validateBundleFn()` returns `{ valid: false }` | Emits `wbp:cart-failed` without making any network calls | Fail-fast client guard |

## Acceptance Criteria
- [ ] SDK cart tests pass.
- [ ] SDK raw source passes `node --check`.
- [ ] SDK bundle is rebuilt before deploy.
