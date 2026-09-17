# Test Spec: Bundle Cart Lock Concurrency & Fallback
**Spec ID:** bundle-cart-lock  **Created:** 2026-09-16

## Purpose
Ensure storefront bundle cart operations are safely coordinated across concurrent executions. When native Web Locks API (`navigator.locks.request`) is available, use exclusive origin locking. When running in environments lacking Web Locks (e.g. embedded mobile WebViews such as Instagram, Facebook, TikTok in-app browsers, or older Safari), provide a non-throwing in-memory sequential Promise queue fallback so add-to-cart operations never freeze or throw `BUNDLE_CART_LOCK_UNAVAILABLE`.

## Test Cases
### NativeCartLock
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Native Web Locks available | `navigator.locks.request` is a function | Acquires exclusive lock `'only-bundles-cart'`, executes operation, releases lock | Native path |
| 2 | Missing `navigator.locks` (in-app WebView) | `navigator.locks` is undefined | Executes operation successfully without throwing | Resilient fallback |
| 3 | Concurrent operations on fallback | 2 simultaneous `withBundleCartLock` calls when `navigator.locks` is absent | Operations execute in sequential order without collision | In-memory mutex |
| 4 | Operation rejection on fallback | Operation throws an error when `navigator.locks` is absent | Error propagates to caller, queue clears and subsequent operation still executes | Error isolation |

## Acceptance Criteria
- [ ] All listed test cases pass
- [ ] Zero `BUNDLE_CART_LOCK_UNAVAILABLE` exceptions thrown
- [ ] ESLint passes with 0 errors
