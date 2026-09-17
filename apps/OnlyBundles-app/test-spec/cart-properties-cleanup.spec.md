# Test Spec: Cart Properties Cleanup (Scoped & Throttled)
**Spec ID:** cart-properties-cleanup  **Created:** 2026-09-16

## Purpose
Ensure internal cart line item properties (prefixed with `_` such as `_bundle_name`, `_wolfpack_bundle_runtime`, `_is_bundle_parent`) are suppressed on legacy 1.0 Shopify themes that omit `{% unless p.first.first == '_' %}`. Optimize DOM observer attachment to scope exclusively to cart containers (`form[action*="/cart"]`, `.cart-drawer`, etc.) and throttle sweeps using `requestAnimationFrame`/`requestIdleCallback`, eliminating storefront CPU spikes, battery drain, and input lag on modern themes.

## Test Cases
### LegacyThemePropertyCleanup
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Raw text nodes in legacy theme | `_bundle_name: 3-Pack<br>_is_bundle_parent: true<br>` inside `.cart-item` | Removes text nodes and trailing `<br>`, preserves public text | 1.0 theme parity |
| 2 | Property wrapper elements | `li.cart-item__property` with `_bundle_name` label | Removes entire `li` wrapper element, preserves non-underscore properties | 1.0 theme parity |
| 3 | Public line properties | `Custom Engraving: John` | Preserved untouched | Public properties intact |

### ScopedObserverAndThrottling
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 4 | Scoped cart container discovery | DOM containing `.cart-drawer` or `form[action*="/cart"]` | Attaches observer exclusively to cart container, not full document.body subtree | Zero DOM lag |
| 5 | Coalesced scheduling | Multiple rapid calls to `scheduleCartPropertiesCleanup` | Coalesces into a single animation frame pass | Throttling |
| 6 | Mutation filtering | Mutation outside cart container (e.g. carousel slide) | Ignored without invoking cleanup pass | Performance safeguard |

## Acceptance Criteria
- [ ] All listed test cases pass
- [ ] 0 ESLint errors
- [ ] Verified in Chrome QA on storefront dev tunnel
