# Test Spec: Direct Storefront GraphQL API Fetching
**Spec ID:** storefront-direct-api  **Created:** 2026-09-17

## Purpose
Directly query Shopify's modern Storefront GraphQL API (`/api/2026-07/graphql.json`) from browser JavaScript using the store's public Storefront Access Token (`storefrontAccessToken`) from `window.__WOLFPACK_PPB_STOREFRONT_RUNTIME__`. Eliminates middleman Remix app proxy latency (300-800ms) and server compute costs for variant prices, inventory, and swatch hydration, while preserving graceful proxy fallback when the public token is not present.

## Test Cases
### StorefrontDirectQuerying
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Direct GraphQL query with public token | `storefrontAccessToken` present on runtime | POSTs directly to `/api/2026-07/graphql.json` with `X-Shopify-Storefront-Access-Token` header | Fast direct path |
| 2 | InContext country pricing | `country` code supplied (e.g. `"US"`) | Includes `@inContext(country: $country)` directive in GraphQL query | Market-accurate prices |
| 3 | Mapping of product nodes | Valid GraphQL response with products, variants, and options | Returns normalized product objects matching widget data contracts | Data contract fidelity |
| 4 | Fallback when token absent | `storefrontAccessToken` is null/undefined | Gracefully falls back to `${apiBaseUrl}/api/storefront-products?ids=...` | Zero breakage on legacy fixtures |

## Acceptance Criteria
- [ ] All listed test cases pass
- [ ] 0 ESLint errors
- [ ] Storefront assets compile cleanly
- [ ] Verified via Chrome QA on active dev session
