---
schema_version: 1
id: shopify-native-audit
title: Shopify-Native Code Review and Over-Engineering Audit
type: architecture
status: active
summary: Comprehensive audit of Only Bundles discounts, cart transform, SDK, and storefront architecture against canonical Shopify APIs.
last_audited: 2026-09-16
owners:
  - engineering
domains:
  - architecture
  - shopify
systems:
  - only-bundles
  - cart-transform
  - discounts
  - storefront
source_paths:
  - apps/OnlyBundles-app/app/services/cart-transform-runtime-token.server.ts
  - apps/OnlyBundles-app/app/services/scheduled-bundle-discount.server.ts
  - apps/OnlyBundles-app/app/services/addon-discount-function-service.server.ts
  - apps/OnlyBundles-app/app/services/checkout-integration-discount-code-service.server.ts
  - apps/OnlyBundles-app/app/assets/sdk/cart.ts
  - apps/OnlyBundles-app/app/storefront/cart-properties-cleanup.ts
  - apps/OnlyBundles-app/app/services/bundles/bundle-parent-product.server.ts
  - apps/OnlyBundles-app/app/routes/api/api.storefront-products.tsx
  - apps/OnlyBundles-app/extensions/bundle-cart-transform-rs/src/runtime_token.rs
  - apps/OnlyBundles-app/extensions/bundle-checkout-ui/src/Checkout.tsx
related_docs:
  - internal docs/Architecture/Widget Architecture.md
  - internal docs/Shopify Integration/Metafields.md
tags:
  - audit
  - shopify-native
  - over-engineering
keywords:
  - shopify native
  - cart transform
  - discount functions
  - over-engineering
---

# Shopify-Native Code Review and Over-Engineering Audit

This document details all instances in Only Bundles where custom logic, cryptographic signing, proxy hops, and DOM scraping were implemented instead of leveraging Shopify's native APIs, platform configuration, and extension capabilities.

---

## 1. Executive Summary Table

| Area | File / Component | Problem Type | Current Implementation | Shopify-Native Solution | Impact / Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cart Transform** | `cart-transform-runtime-token.server.ts`<br>`runtime_token.rs`<br>`api.cart-transform-runtime-token.tsx` | Over-Engineering / Reinvention | Custom HMAC-SHA256 token generation, signing secrets (`$app:runtime_token_secret`), and Rust Wasm token verification. | Use native Cart Transform `expand` with parent variant `component_reference` metafields, and `merge` with native cart line attributes. | Severe latency: requires 4 separate network roundtrips before every "Add to Cart". |
| **Cart Operations** | `apps/OnlyBundles-app/app/assets/sdk/cart.ts` | Multi-Hop Network Over-Engineering | Sequence on Add to Cart: 1) POST runtime token, 2) GET `/cart.js`, 3) POST `/cart/update.js` (dummy note update), 4) POST `cart-bundle-details` (mutates cart metafield via Storefront API), 5) POST `/cart/add`. | Single native POST `/cart/add.js` with bundle line items and properties. | High cart abandonment, race conditions, multi-second add-to-cart latency. |
| **Cart Lock** | `apps/OnlyBundles-app/app/lib/bundle-cart-lock.ts` | Bug / Incompatibility | Hardcoded requirement for `navigator.locks.request`. Throws `BUNDLE_CART_LOCK_UNAVAILABLE` if unsupported. | Use standard async mutex or rely on Shopify's native atomic cart operations. | Completely blocks checkout on mobile WebViews (Instagram/FB browser, older Safari, in-app browsers). |
| **Discount Functions** | `scheduled-bundle-discount/src/cart_lines_discounts_generate_run.rs` | Reinventing the Wheel | Custom 400-year Gregorian cycle calculator (`monthly_occurrence` in Rust) inside a WebAssembly discount function. | Native Shopify automatic discount scheduling (`startsAt`, `endsAt`) on `DiscountAutomaticApp`. | Wasted Wasm execution fuel/time, complex recurrence logic that Shopify platform handles natively. |
| **Discounts Architecture** | `bundle-discount-function`<br>vs<br>`scheduled-bundle-discount` | Duplicate Infrastructure | Two separate Rust discount function extensions deployed to Shopify targeting the exact same API target (`cart.lines.discounts.generate.run`). | Single unified product discount function or native Shopify Automatic Discounts. | Double function invocation, double extension maintenance, complex reconciliation scripts. |
| **Discount Codes** | `checkout-integration-discount-code-service.server.ts`<br>`api.checkout-integration-discount-code.tsx` | Anti-Pattern / Over-Engineering | Creates ephemeral single-use discount codes (`WPB-PROVIDER-XXXX`) with 30-min TTL in Shopify Admin via GraphQL per checkout. | Use native Shopify Automatic Discounts or standard cart-level discount allocations. | Pollutes merchant's Shopify Admin discount table with thousands of abandoned single-use codes. |
| **Checkout UI** | `bundle-checkout-ui/src/Checkout.tsx` | Buggy Logic | Total savings computed as `Math.max(checkoutNativeSavings, lineNativeSavings)`. | Sum order-level and line-level discount allocations (`orderDiscountAllocations + lineDiscountAllocations`). | Under-reports merchant total savings when order discounts and bundle discounts combine. |
| **Storefront App Embed** | `apps/OnlyBundles-app/app/storefront/cart-properties-cleanup.ts` | Over-Engineering / Performance Bug | Attaches `MutationObserver` on `document.body` (all mutations, `subtree: true`) running `TreeWalker` + Regex on text nodes to hide `_` properties. | Follow canonical Shopify standard: `_` leading properties are natively hidden by Shopify; fix Liquid templates with CSS `[data-property^="_"] { display: none; }`. | Continuous DOM traversal causes CPU spikes, battery drain, and input lag on merchant storefronts. |
| **FPB Storefront Routing** | `bundle-app-embed.liquid`<br>`app-embed.ts`<br>`bundle-parent-product.server.ts` | Anti-Pattern / SEO Bug | Renames parent product handles to `wpb-parent-*`, creates Shopify URL Redirects via GraphQL, and forces client-side `window.location.replace` to `/apps/product-bundles/wpb/*`. | Render bundle builder directly on `/products/<handle>` using native Theme App Extension Product Page Block (`type: "product"`). | Flashes of unstyled content, SEO cannibalization, and broken redirect links when app is uninstalled. |
| **Storefront API** | `api.storefront-products.tsx`<br>`api.storefront-collections.tsx` | Redundant Proxy Layer | Node/Remix server endpoints acting as middleman proxies between storefront JavaScript and Shopify Storefront API GraphQL. | Direct browser queries to Shopify Storefront API using public Storefront Access Token, or Shopify AJAX API (`/products/<handle>.js`). | 300–800ms proxy latency, server memory bloat, unnecessary compute costs, proxy rate limiting. |

---

## 2. Detailed Findings & Analysis

### 2.1 Cart Transform Runtime Token Cryptographic System
- **Files**:
  - `apps/OnlyBundles-app/app/services/cart-transform-runtime-token.server.ts`
  - `apps/OnlyBundles-app/extensions/bundle-cart-transform-rs/src/runtime_token.rs`
  - `apps/OnlyBundles-app/app/routes/api/api.cart-transform-runtime-token.tsx`
- **What it does**:
  When a shopper customizes a bundle, the browser calls the app backend to validate the bundle selection against database rows and Shopify Admin GraphQL. The server computes an HMAC-SHA256 token using a secret stored in Shopify's `$app:runtime_token_secret` metafield. The Rust Wasm function in Cart Transform decodes the base64 URL payload and verifies the signature on every cart mutation.
- **Why it is over-engineered**:
  Shopify's Cart Transform function is already an authenticated, sandboxed server-side WebAssembly environment running inside Shopify's core infrastructure. By design, Cart Transform reads merchant-configured metafields on the products/variants (`component_reference`, `price_adjustment`) or Cart Line attributes.
  There is zero need for a custom HMAC signing infrastructure between the Remix app and the Cart Transform function. The Cart Transform function can directly read the parent product's published metafields and validate quantities.

---

### 2.2 The 5-Step "Add to Cart" Waterfall
- **File**: `apps/OnlyBundles-app/app/assets/sdk/cart.ts`
- **What it does**:
  Executing `addBundleToCart()` runs this synchronous waterfall:
  ```
  [User Clicks Add]
          │
          ▼
  1. POST /apps/product-bundles/cart-transform-runtime-token (Remix proxy)
          │
          ▼
  2. GET /cart.js (Fetch cart token)
          │
          ▼
  3. POST /cart/update.js (If missing token key, send dummy note update)
          │
          ▼
  4. POST /apps/product-bundles/cart-bundle-details (Storefront GraphQL mutation on cart)
          │
          ▼
  5. POST /cart/add (Ajax cart add)
  ```
- **Why it is over-engineered**:
  Standard Shopify bundle apps add bundle items in **one single POST request** to `/cart/add.js`. All component information and bundle identification can be passed as standard line item properties (`_bundle_id: "xyz"`) or by adding the parent variant (for FPB).
  The current approach creates massive latency (2–4 seconds before the cart drawer even responds), multiplying network failure rates by 5.

---

### 2.3 `BUNDLE_CART_LOCK_UNAVAILABLE` Exception
- **File**: `apps/OnlyBundles-app/app/lib/bundle-cart-lock.ts`
- **Issue**:
  ```typescript
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new Error('BUNDLE_CART_LOCK_UNAVAILABLE');
  }
  ```
- **Consequence**:
  `navigator.locks` is unsupported in several embedded WebViews (e.g. Instagram, Facebook, TikTok in-app browsers, older iOS Safari, embedded iframes). In those environments, the script throws an unhandled rejection and the "Add to Cart" button permanently freezes with a spinning loader.

---

### 2.4 Duplicate Discount Function Extensions & Wasm Calendar Calculation
- **Files**:
  - `apps/OnlyBundles-app/extensions/bundle-discount-function`
  - `apps/OnlyBundles-app/extensions/scheduled-bundle-discount`
- **Issues**:
  1. **Duplicate Functions**: Two separate Shopify function extensions are maintained and compiled (`api_version = 2026-04` and `api_version = 2026-07`), both targeting `cart.lines.discounts.generate.run`.
  2. **Reinventing Calendar Cycles**: In `scheduled-bundle-discount/src/cart_lines_discounts_generate_run.rs`:
     ```rust
     fn monthly_occurrence(anchor: NaiveDate, date: NaiveDate) -> i64 {
         let months = ...;
         let cycles = months / 4800; // 400-year Gregorian cycle
         ...
     }
     ```
     Shopify's native `DiscountAutomaticApp` already accepts `startsAt` and `endsAt`. The platform automatically controls discount eligibility periods without needing date/calendar math in Wasm.

---

### 2.5 Ephemeral Discount Code Generation in Shopify Admin
- **File**: `apps/OnlyBundles-app/app/services/checkout-integration-discount-code-service.server.ts`
- **Issue**:
  Calls Admin GraphQL `discountCodeAppCreate` to generate single-use discount codes (`WPB-PROVIDER-RANDOM`) valid for 30 minutes.
- **Consequence**:
  Every checkout attempt creates a permanent discount node in the merchant's Shopify Admin. Stores with thousands of visitors get flooded with dead discount codes in their Shopify Admin Discounts dashboard.

---

### 2.6 TreeWalker DOM MutationObserver for Hidden Properties
- **File**: `apps/OnlyBundles-app/app/storefront/cart-properties-cleanup.ts`
- **Issue**:
  ```typescript
  const observer = new MutationObserver((mutations) => {
    scheduleCartPropertiesCleanup();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ```
  Walks all text nodes on the page with regex looking for `_is_bundle_parent`, `_wolfpackProductBundle`, etc.
- **Why it is bad**:
  Shopify already hides properties starting with `_` by convention. Even for poorly coded themes, this should be solved via CSS scoping or targeted Liquid snippet injection, never with an unthrottled full-page `MutationObserver` on `document.body`.

---

### 2.7 Full Page Bundle Client & Server Redirection System
- **Files**:
  - `bundle-app-embed.liquid`
  - `app-embed.ts`
  - `bundle-parent-product.server.ts`
- **Issue**:
  Creates backend URL redirects via Shopify's `urlRedirectCreate` and injects `window.location.replace(embed.dataset.redirectPath)` to push buyers away from `/products/my-bundle` to `/apps/product-bundles/wpb/<number>`.
- **Consequence**:
  Merchants lose their theme headers, footers, SEO canonical product URLs, and analytics tracking. When the app is uninstalled, broken 404 redirects linger in the merchant's Shopify URL Redirects list.

---

## 3. Recommended Remediation Roadmap

1. **Unify & Simplify Add-to-Cart**:
   - Transition to a single native `/cart/add.js` call.
   - For FPB: Add the bundle parent variant with `requiresComponents: true`. Cart Transform automatically expands components based on `component_reference`.
   - For PPB: Add components with standard line attributes. Cart Transform merges them natively.
   - Eliminate `/api/cart-transform-runtime-token` and `/api/cart-bundle-details`.
2. **Consolidate Discount Functions**:
   - Merge `scheduled-bundle-discount` into `bundle-discount-function`.
   - Remove Gregorian calendar calculation; use native Shopify `startsAt` / `endsAt`.
   - Eliminate ephemeral `discountCodeAppCreate` calls.
3. **Remove DOM Scraping & Redirection**:
   - Delete `cart-properties-cleanup.ts`'s full-page `MutationObserver`.
   - Remove `window.location.replace` and `urlRedirectCreate` for Full Page Bundles; render within native product templates using Theme App Extension App Blocks.
4. **Direct Storefront API Queries**:
   - Allow the storefront widget to query Shopify Storefront API directly with the published Storefront Access Token, removing the middleman `/api/storefront-products` proxy route.
