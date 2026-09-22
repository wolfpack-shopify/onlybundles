# Test Spec: Checkout Integrations Discount Codes
**Spec ID:** checkout-integrations-discount-code  **Created:** 2026-07-02

## Purpose
Verify checkout integrations use a typed provider selection and short-lived app discount codes with the
current provider scope (`native`, `theme_cart_drawer`, `gokwik`, `shopflo`) and no non-whitelisted providers
flow into checkout-integration discount creation.

## Test Cases
### SettingsControlsRuntime
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Landing page checkout provider selected | Checkout Settings = Redirect to Checkout, Checkout Integration = GoKwik | Runtime checkout action is `checkout`, provider is `gokwik`, no execute script is exposed | Full-page only |
| 2 | Unknown provider value | Checkout Integration = unexpected value | Runtime provider falls back to `native` | Prevents unsafe callbacks |
| 3 | Theme cart provider selected | Checkout Integration = Theme cart drawer | Runtime provider is `theme_cart_drawer` | Side-cart providers are stored as typed IDs |

### CheckoutIntegrationProviderRegistry
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Provider options exposed | none | Options are Shopify checkout, Theme cart drawer, GoKwik, Shopflo | Active provider scope for checkout behavior |
| 2 | Discount-code provider classification | provider IDs | `gokwik`, `shopflo` return true; `native`, `theme_cart_drawer` return false | Keeps app-proxy endpoint closed |

### CheckoutIntegrationDiscountCodeService
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Existing active discount code found | admin, shop, provider `gokwik` | Reuses existing discount node without calling `discountCodeAppCreate` | Stable reusable code (WPB-GOKWIK) |
| 2 | No existing discount code found | admin, shop, provider `gokwik` | `discountCodeAppCreate` called with stable code `WPB-GOKWIK`, no usage limit, no endsAt expiration | Created once per provider |
| 3 | Supported provider creates code | admin, shop, provider `shopflo` | `discountCodeAppCreate` title uses `Shopflo` and code `WPB-SHOPFLO` | Validates both handoff providers |
| 4 | Existing code race / duplicate | mutation returns code already exists error | Recovers existing code node and succeeds | Idempotent / race resilient |
| 5 | Missing discount function | function lookup returns empty | Failure result without mutation | No hardcoded function ID |
| 6 | Shopify user error | mutation returns userErrors | Failure includes message | Surface setup issue |

### AppProxyRoute
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Signed storefront request | supported provider | JSON `{ ok: true, code: "WPB-GOKWIK", expiresAt: null }` | Uses unauthenticated Admin |
| 2 | Unsupported provider | provider outside discount-code provider set | 400 and no code creation | Closed provider list |
| 3 | Unsigned request | bad signature | 400 and no Admin call | App proxy guard |
| 4 | Handoff provider | provider `shopflo` | Code creation is allowed with `WPB-SHOPFLO` | Covers second handoff provider |

## Acceptance Criteria
- [ ] All listed unit and function tests pass.
- [ ] Admin exposes one Checkout card set and no external competitor URLs.
- [ ] Storefront reuses or creates a stable provider discount code (`WPB-GOKWIK`, `WPB-SHOPFLO`) without random UUID suffixes.
- [ ] Stable provider discount code has no usage limit and no expiration date.
- [ ] Storefront opens or refreshes cart drawer integrations without calling the discount-code endpoint.
- [ ] Native and theme-cart providers remain unchanged where applicable.
