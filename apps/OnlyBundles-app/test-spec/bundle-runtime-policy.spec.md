---
schema_version: 1
id: bundle-runtime-policy
title: "Test Spec: Bundle Runtime Policy Compiler + Publisher"
type: test-spec
status: active
summary: Behavior and integration gates for authoritative bundle policy publication and Shopify Function validation.
last_audited: 2026-09-20
owners: [engineering]
domains: [development]
systems: [only-bundles]
source_paths:
  - app/lib/bundle-runtime-policy-types.ts
  - app/services/bundle-runtime-policy.server.ts
  - app/services/bundle-runtime-policy-publisher.server.ts
  - extensions/bundle-runtime-policy/src/lib.rs
  - extensions/bundle-cart-transform-rs/tests/runtime_policy.rs
related_docs:
  - internal docs/Architecture/Cart Transform Function.md
tags: [tdd, bundle-authorization, metafield]
keywords: [policy compiler, metafield, bundle runtime, authorization]
---

# Test Spec: Bundle Runtime Policy Compiler + Publisher
**Spec ID:** bundle-runtime-policy  **Created:** 2026-09-19

## Purpose
Verify that the policy compiler produces correct, bounded, authoritative policy
projections from a saved bundle configuration, and that the publisher writes
them to Shopify metafields using a staged activation sequence.

## Test Cases

### CompileBundleRuntimePolicy (pure function, no network)

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| 1 | BuyXGetY 2+1 | 1 group (component, min=0, max=10), 3 all-variant products, BXY pricing | 3 policies, each with correct groups, memberships.mode = 'all_product_variants', correct pricing |
| 2 | Variant allowlist | Product has 2 explicit variantIds | membership.variantSelection = { mode: 'listed_variants', variantIds: [...] } |
| 3 | Listed variants don't fall back | Product has 2 listed variants, 3rd exists | mode: 'listed_variants' with exactly 2 IDs; no 'all_product_variants' |
| 4 | Size within budget | Normal 3-product bundle | JSON.stringify(policy).length < 9500 per product |
| 5 | Size over budget | 50 group entries per product | { ok: false, error: 'POLICY_TOO_LARGE', productId } |
| 6 | Country restriction | countryCodes: ['AU','NZ'], mode: 'include' | countryRule encoded and present on each policy |
| 7 | Default product group | defaultProductsData with requiredQuantity=2 | 'default-products' group with min=max=2 |
| 8 | Free gift role | isFreeGift: true, addonDisplayFree: true | role: 'free_gift' |
| 9 | Add-on role | isFreeGift: true, addonDisplayFree: false | role: 'addon' |
| 10 | Missing parentVariantId | empty parentVariantId | { ok: false, error: 'MISSING_PARENT_VARIANT' } |
| 11 | Missing bundleId | empty bundleId | { ok: false, error: 'MISSING_BUNDLE_ID' } |
| 12 | No eligible products | step with zero products | { ok: false, error: 'NO_ELIGIBLE_PRODUCTS' } |
| 13 | Deterministic revision | same bundle input twice | revision === sha256(canonicalJSON) both times |
| 14 | Subscription allowed plans | selectedPlanIds configured | allowedSellingPlanIds in policy matches config |

### PublishBundleRuntimePolicy (requires mock Admin API)

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| 15 | Happy path | 3 products, all writes succeed, readback matches | metafieldsSet called for products then shop activation; { ok: true } |
| 16 | Activation blocked on write failure | 2nd product write fails | shop revision NOT activated; { ok: false, error: 'STAGE_WRITE_FAILED' } |
| 17 | Readback mismatch aborts | writes succeed, readback differs | aborts before activation; { ok: false, error: 'READBACK_MISMATCH' } |
| 18 | Batching >25 products | 30 products | two batches (25+5); each verified before next |
| 19 | Compiler error propagates | policy > 9500 bytes | { ok: false, error: 'POLICY_TOO_LARGE' }; no metafields written |

### Runtime policy and build regressions

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| 20 | Membership, active status, or schedule changes | Changed canonical configuration | Revision changes |
| 21 | All pricing tiers | Multiple saved pricing rules | All rules retained |
| 22 | Malformed variant allowlist | Invalid explicit variant ID | Compilation fails closed |
| 23 | Shared product and staged revision | Existing policies on a product | Preserve unrelated bundles and the active revision until activation |
| 24 | Concurrent registry publication | compareDigest conflict | Do not overwrite the concurrent activation |
| 25 | Retained projection or registry too large | Combined publication exceeds limits | No staging writes |
| 26 | Tokenless B2G1 | Two products, three $20 units, Shopify product policy JSON | One $40 merge |
| 27 | Forged identifiers, role, or variant | Changed selection or non-allowlisted actual variant | No operation |
| 28 | Missing policy, inactive or stale registry | Incomplete authoritative input | No operation |
| 29 | Split lines | Same product across duplicate lines | Enforce aggregate product limit |
| 30 | Unknown or incomplete variant selection mode | Missing allowlist or invalid mode | No operation |
| 31 | Input query budget | Actual Cart Transform query | Complexity at most 30 |
| 32 | Optimized WASM replay | B2G1 fixture through Shopify trampoline and runner | Executes successfully, retains the $40 calculation, final binary under 256000 bytes |
| 33 | Scheduled cart representation | Scheduled published bundle | Keep component lines; native discount dates govern benefits; regular-price purchase outside window |
| 34 | Direct dedicated parent add | Parent without selected components | No self-expansion; Shopify requiresComponents rejects direct purchase |
| 35 | Individual default products | Required product omitted and another duplicated | No operation even when aggregate default quantity matches |
| 36 | Canonical quantity bounds | Saved step condition operators and values | Enforce both bounds and ignore retired min/max columns |
| 37 | Component country restrictions | Actual localization inside or outside published rule | Benefit only in an eligible country |
| 38 | Invalid required quantities | Negative, fractional, nonnumeric or overflowing default requirement | Compilation fails before any publication; zero remains an optional product |
| 39 | Amount and weight step rules | Canonical bounds | Preserve both rules; normalize money to shop-currency cents and weight to grams |
| 40 | Malformed step rules | Unknown metric/operator or invalid numeric threshold | Compilation fails instead of silently discarding a merchant rule |
| 41 | Shared pricing calculation | Existing Cart Transform pricing fixtures | Identical pricing from the shared domain library for reuse by the Discount adapter |
| 42 | FPB default-product publication wiring | Saved defaults through the FPB sync config and compiler | Every projection retains individual required products and their quantities |

## Current verification and remaining gates

Compiler/publisher and native Rust regressions pass. Query complexity is below 30.
The prior panic-snipped WASM trapped after five instructions both locally and in
Shopify preview logs. The build owner now leaves ABI adaptation and optimization
to Shopify CLI. The final preview binary is 252,672 bytes and its unsnipped replay
returns the expected $40 B2G1 merge. Live preview logs also report successful
execution. After preview cleanup, both widgets load version 23.0.0 from the new
extension handle with HTTP 200 responses. Chrome cart acceptance remains blocked
by a separate production-app Cart Transform on the same QA store: its failure
stream shows a five-instruction trap with blockOnFailure enabled. Storefront
cartCreate reports MERCHANDISE_LINE_TRANSFORMERS_RUN_ERROR. The SIT app's own
transform succeeds; its app-scoped Admin query cannot list the other app's owner.
With explicit user approval, production registration 128057603 was backed up and
removed only from agent-5sfidg3m.myshopify.com. Ordinary product adds then returned
200. PPB merged three units into one $40 parent; the no-discount FPB fixture merged
the same quantities into one $60 parent and reached checkout. A direct PPB parent
add returned Shopify's specific bundle rejection and left the cart empty. These
are baseline signed-flow results, not tokenless storefront acceptance. The
production registration remains removed on this QA store pending restoration.

Do not activate the new publisher from bundle saves until the coordinated
storefront and Discount Function cutover is complete. Collection memberships,
category conditions, add-on tiers,
subscriptions, scheduled discounts, checkout codes, and live PPB/FPB Chrome QA
remain acceptance gates. Scheduled offers must retain component cart lines and
allow regular-price purchase outside their active window, per user confirmation.
Dedicated bundle parents must require widget selections, also confirmed by the
user. Both the valid component add and native direct-parent rejection are now
verified in Chrome against the repaired SIT runtime.

## Tokenless cutover coverage

- Category requirements aggregate Shopify quantities, prices and weights only for published members.
- Saved subscription `enabled`, allowed allocated plans, purchase target and recurring roles are enforced.
- Add-on tier thresholds and tier product selections come from published configuration; add-on bundles retain component lines.
- PPB, FPB and SDK submissions carry compact selection identifiers and optional presentation metadata, with no token request or cart authorization write.
- Function grouping uses bundle and instance identifiers; legacy offer properties are unnecessary.
- The storefront revision column changes only after verified Shopify activation; the shop registry remains authoritative.
- Discount owner configuration supplies non-secret roles and Shopify local-time query variables.
- Checkout offers submit selection identifiers through Shopify cart-line APIs and allow valid regular-price cart changes outside schedules.
- Order analytics reads attribution identifiers without verifying custom bundle tokens.
- Checkout codes publish the exact permitted code and non-secret input variables to their Discount owner.
- Required default-product hydration records the Shopify-returned inventory.
- Merged cart lines show computed Retail Price, Bundle Price and amount/percentage Bundle Savings without Items.
- Runtime product, parent and registry definitions prevent merchant writes; general sync fails when definition provisioning fails.
- Add-on tier quantity and metric conditions apply to the aggregate selected group.

## Acceptance Criteria
- [ ] All listed test cases pass
- [ ] Compiler is a pure function (no network; no dependency injection needed)
- [ ] Publisher uses typed Result return values, not thrown exceptions, for expected errors
- [ ] npm run test:unit exits 0
- [ ] npm run lint -- --max-warnings 9999 exits 0 on all new files

## Comprehensive Chrome pass — 2026-09-19

Each pricing and commercial configuration must run on both FPB and PPB.
Carry compatible fixture state forward and restore original pricing at the
pricing-group boundary. A widget total alone is not a cart or checkout pass.

| Configuration | Selected merchandise / boundary | Expected merchandise total | FPB | PPB |
|---|---|---|---|---|
| Percentage off 20%, minimum 3 | Three $20 units | $48; $12 savings | Widget and checkout passed | Widget, cart and checkout passed |
| Percentage below threshold | Two $20 units | $40; no savings | Chrome cart passed | Widget passed |
| Fixed amount off $10 | Three $20 units | $50 | Widget and checkout passed | Widget, cart and checkout passed |
| Fixed bundle price $35 | Three $20 units | $35 | Widget and checkout passed | Widget, cart and checkout passed |
| Buy 2 get 1 free | Three $20 units | $40 | Widget and checkout passed | Widget, cart and checkout passed |
| Buy 2 get 1 half price | 2, 3, 4, 6 units | $40, $50, $70, $100 | Chrome cart boundaries passed | Chrome cart boundaries passed |
| Buy 2 get $5 off 1 | 2, 3, 4, 6 units | $40, $55, $75, $110 | Chrome cart boundaries passed | Chrome cart boundaries passed |
| Multiple tiers | Two units at 10%; three at 25% | $36; $45 | Chrome cart and mobile UI passed | Chrome cart passed |
| Disabled discount | Three $20 units | $60; no savings | Chrome cart passed | Chrome cart passed |
| Quantity / amount operators | Below, equal, above each threshold | Only eligible tier applies | Chrome quantity gte/gt/lte/lt/eq and amount gte passed | Chrome quantity gte/gt/lte/lt/eq and amount gte passed |
| Add-ons / gifts | Eligible, below tier, over quantity, forged role | Only published benefit applies | Chrome add-on/gift boundaries and desktop/mobile widget paths passed | Chrome add-on/gift boundaries and widget paths passed |
| Schedule | Before, active, expired; recurring dates | Native window controls discount; purchase remains possible | Future/active/expired one-time and active/inactive weekly/monthly Chrome cart passed | Future/active/expired one-time and active/inactive weekly/monthly Chrome cart passed |
| Subscription | Allowed and disallowed plan; one-time; recurring role | Correct component pricing, no merge for selling plans | Widget and checkout passed for native monthly plan and one-time purchase; invalid plan rejected | Widget and checkout passed for native monthly plan and one-time purchase; invalid plan rejected |
| Defaults / groups / variants | Missing defaults, absent groups, restricted variants | No invalid benefit | Exact quantity/amount groups and individual defaults passed in Chrome after fixing publication; variant case pending | Exact quantity/amount groups and individual defaults passed in Chrome; variant case pending |
| Cart edits | Quantity change, split lines, multiple instances, removal | Revalidated totals and composition | Component edits, split BXY and two instances passed; merged quantity presentation remains a gate | Component edits, split BXY and two instances passed; merged quantity presentation remains a gate |
| Checkout code | Exact owner code, missing and forged code | Only eligible component policy grants benefit | Native Function candidate passed | Native Function candidate passed |
| Responsive builder | Desktop and mobile; OOS, clear, empty submit, selections | Usable controls and consistent totals | Desktop/mobile flows passed | Desktop/mobile flows passed |
| Function input capacity | Ordinary eligible products split across cart lines, no requested bundle | Ordinary cart remains purchasable | Shared-rule layout passed 50 and 200 lines | Shared-rule layout passed 50 and 200 lines |

Fresh PPB preview served widget 24.0.0 and theme assets with HTTP 200 under
`dev-08504fa5-cf53-4786-9a6f-1a1f6956aeb6`. Both 20% checkout summaries showed
three native components, Retail Price $60, Bundle Price $48 and Bundle Savings
$12 (20%), with no Box property. No order was submitted.

Fixed during this pass: FPB desktop summary counted distinct products rather
than units. A failing behavior test reproduced it; all 45 focused tests pass
after correction, and Chrome now displays `3 item(s)` for three selected units.

The existing pricing `eq` operator is a threshold (`>=`), consistently in the
widget and shared pricing engine. Step `equal_to` is exact. The live pricing
matrix records current behavior; changing this pricing contract is a separate
merchant-semantics decision.

FPB sync also omitted `defaultProductsData`, so required defaults did not reach
the published policy. The regression through the sync builder and compiler
failed before the fix; 69 focused tests passed afterward. Chrome confirmed the
valid three-unit selection costs $48, while missing, duplicated or completely
absent defaults receive no benefit. PPB passed the same cases. Exact step
quantity 3 and exact step amount $60 authorize only the three-unit selection;
two, four and six units remain unmerged at regular price on both types.

The messaging findings were corrected and reverified. Buy-X-get-Y now identifies
both quantities and the getting-unit discount, for example `Buy 2, get 1 at 100% off`.
Fixed-price tiers render `Bundle price: $35.00` without a percentage suffix.

Commercial cart checks used Shopify Ajax in Chrome, independently of widget UI.
For both types, one paid unit plus one add-on cost $40; two paid units plus one
50%-off add-on cost $50; two add-ons exceeded the published maximum and cost $80
with two paid units. Forging `addon:PERCENTAGE:100` did not change the authorized
50% saving. PPB's three paid units plus one add-on cost $50 with its B2G1 rule;
FPB's equivalent selection cost $70 without a component discount. Active native
schedules retained these prices; expired schedules cost $40/$60/$80/$80 for
paid/add-on quantities 1/1, 2/1, 3/1, 2/2 and allowed purchase.

The initial PPB combined-discount check exposed a $50.02 result. A failing Rust
test reproduced the per-unit percentage rounding. The Discount Function now
emits Shopify fixed amounts once per entitled line, computed from actual input
prices and validated savings. Retesting produced exactly $50.00. Nine Discount
Function tests pass, including presentment conversion, and the input query
passes Shopify validation. This does not establish every currency's rounding.
An additional failing regression reproduced a $20.01 saving when the same three
units were split into separate lines. Allocation now rounds cumulative savings
per validated instance and assigns the difference to each line, preserving the
exact total for split BXY and fixed-price selections. Chrome BXY retesting passed
on both types: $40 for three split lines and $80 for two instances. Each instance
allocates the $20 saving as $6.67/$6.66/$6.67. Fixed-price split retesting also
passed on both types: $35 per instance and $70 for two, with each $25 saving
allocated as $8.33/$8.34/$8.33. Active weekly schedules produced BXY totals and
active monthly schedules produced BXY and fixed-price totals; inactive weekly and monthly dates
left three/six units at $60/$120 without blocking purchase.

Both subscription fixtures used the existing monthly plan on the earrings
variant. Its Shopify-allocated price was $476.10; a 20% bundle discount produced
$380.88 with component representation. One-time purchase cost $529.00 without a
bundle discount. Shopify rejected an invalid plan with HTTP 422 and an empty
cart. Both initial-only and recurring configurations passed these cart checks;
future renewal execution and a valid-but-policy-disallowed plan remain distinct
unverified cases. Original subscription and commercial configurations were
restored through normal publication after their fixture groups.

The stale preview was superseded by a fresh CLI preview. It served
`dev-6e8324ea-2ce1-4fc0-99ba-666d5db17780`, widget 24.0.0, and the rebuilt FPB
hydration lookup. The image-free subscription product rendered and completed
both subscription and one-time checkout paths.

### Whole-cart input capacity: original failure, subsequently corrected

Chrome ordinary-cart stress checks succeeded with 10 and 30 separate Roasted
lines, but 50 lines returned HTTP 422 and an empty cart. No line requested a
bundle. SIT log `20260919_194034_190Z_extensions_bundle-cart-transform-rs_0a01ef.json`
reports `InputSizeLimitExceededError`: 154,765 bytes against the 128,000-byte
limit, before Function execution. Repeated complete product policies exceed the
whole-cart budget even though each metafield meets its individual size limit.
The ten-selection guard cannot address an input failure before execution.

Do not release this layout as fully migrated. Shared rule storage queried once,
compact product membership/revision references, and publication-time whole-input
bounds need a revised design. The user has been asked for direction because
that changes the proposed placement of complete group rules on each product.
The cart was cleared after the capacity test. Subsequent logging was throttled
for one minute; missing logs during that interval are not execution evidence.

### Savings visibility
| # | Scenario | Input | Expected Output | Notes |
| 1 | Full-price bundle | Zero permitted discount | Retail Price and Bundle Price; no Bundle Savings | Same properties reach cart and checkout |
| 2 | Discounted bundle | Three $20 units, buy two get one | Bundle Savings: $20.00 (33.33%) | Computed from Shopify prices |
| 3 | Default box metadata | Browser display metadata contains box 1 | No visible Box property on the merged line | Bundle instance and quantity retain their actual identifiers |

### Native schedule publication
| # | Scenario | Input | Expected Output | Notes |
| 1 | Subsecond schedule boundary | Date with milliseconds | Native discount publishes at second precision and passes readback | Verified Shopify truncates milliseconds |

### Checkout code authorization
| # | Scenario | Input | Expected Output | Notes |
| 1 | Exact native owner code | Valid published component bundle and matching triggering code | Published pricing applies | No browser total or token |
| 2 | Forged or absent code | Different code with the same prefix, or no triggering code | No candidate | Exact owner configuration controls eligibility |
| 3 | Revoked policy | Matching code, inactive revision | No candidate | Code cannot override publication status |

### Canonical publication and checkout inputs
| # | Scenario | Input | Expected Output | Notes |
| 1 | Canonical variant selection | Saved variantGraphqlId | Restricted membership preserves the selected variant | Defaults and add-ons |
| 2 | Category variant restriction | Category contains only selected variants | Other variants receive no category credit | Uses raw canonical saved records |
| 3 | Incomplete collection pagination | hasNextPage without a new cursor | Publication fails before activation | Never publish a partial allowlist |
| 4 | Missing subscription display copy | Valid compiled allowed-plan policy | Required native subscription owner is provisioned | Display text is not eligibility |
| 5 | Checkout parent hydration | Shopify-returned app namespace and current revision | Storefront query uses that namespace and refetches after revision changes | No guessed reserved namespace |
| 6 | Specific-link visibility | Same bundle with specificLinkRequired enabled or disabled | Identical published purchase rules and revision | Link affects visibility only |

### Component-line rounding regression

Three identical $20 paid units under buy-two-get-one plus a $20 add-on at
50% produced $50.02 through the Discount Function. Shopify applied the
percentage per unit. Emit the permitted saving once per line using native
`fixedAmount` with `appliesToEachItem: false`. Regression tests verify the exact
$20 line saving and $27 saving with a 1.35 presentment rate. All nine Discount
Function tests pass. Chrome retest produced exactly $50 and retained no-benefit
behavior below the tier and above the add-on ceiling.

## Shared rules and compact membership publication

Approved storage revision: activate shared group, pricing, subscription and country rules in the shop registry. Shared membership definitions are deduplicated by their revision and contents; each product carries only the references it authorizes. No browser-provided reference is evidence of membership.

| Scenario | Expected result |
| --- | --- |
| Publish two eligible products with identical memberships | One shared definition and compact product references |
| Wrong product reference or inactive revision | No benefit |
| Partial staging or concurrent activation | Existing active rules remain authoritative |
| Retained references exceed the cart input budget | Reject before staging writes |
| 50 ordinary cart lines from the reported failure | Shopify accepts cart without input-size failure |
| 200 ordinary cart lines | Measure complete Function input and execution, including shared registry |

The publication estimate reserves ordinary Shopify cart facts plus bounded bundle selections and Function-owner configuration; it cannot guarantee arbitrary buyer-controlled attribute sizes.

Approved discount copy: buy-X-get-Y displays both unit counts and the discount on the getting units; fixed-price tiers display `Bundle price: <formatted amount>` without a percentage or an “off” suffix. Test storefront message variables and Cart Transform metadata through cart progress rendering.

### Shared-rule verification (2026-09-20)

- Publisher: 15 behavior cases, including shared membership deduplication, per-product references, retained-reference capacity, CAS and readback failures.
- Chrome ordinary carts: 50 lines / $1,000 / HTTP 200 / 24,564 input bytes; 200 lines / $4,000 / HTTP 200 / 91,826 input bytes. Both had actual compact product memberships in Function input.
- PPB widget: 1 Roasted + 2 Peri Peri produced one $40 parent, Retail Price $60, Bundle Price $40, positive-only Bundle Savings $20 (33.33%), and “Buy 2, get 1 at 100% off” in the widget and cart progress.
- Both checkout-code input spellings normalize to WPB-GOKWIK in Shopify Function input. The Function emitted the correct $20 gift candidate, while Shopify chose the equal automatic discount. Forged codes did not produce code candidates.
- Fixture gift steps were removed and baseline configurations restored before the fixed-price message pass.

### Add-on storefront pricing regression

Chrome FPB exposed an incorrect $25 widget total for three $20 paid units with a $35 fixed bundle price and one $20 add-on discounted by 50%; checkout correctly charged $45. The shared storefront discount calculation must exclude add-ons from base pricing and threshold qualification before the existing add-on discount is combined. Cover fixed price, percentage, fixed amount, buy-X-get-Y and the below-threshold quantity case.

Active add-on tier conditions must also gate widget quantity increases, using Admin's canonical `conditions` records. Both FPB and PPB must reject a second selected unit when the active tier permits at most one, while allowing removal. Shopify continues to enforce the same condition against the actual cart.

### Final add-on regression evidence

- Both widgets now preview $45 for $35 of paid components plus one half-price $20 add-on; PPB Ajax cart and FPB desktop/mobile checkout also report $45.
- FPB mobile (390 CSS pixels) retains four units and $45 after attempting to increase the one-unit add-on beyond the active tier limit; no horizontal overflow. PPB likewise retains one add-on and $45.
- Shared checks reject partial selected add-ons at submission while keeping omitted optional add-ons valid. Add-ons cannot qualify their own paid-product eligibility threshold.
- Full Jest run after these changes: 613 suites passed, 4,096 tests passed; the same two pre-existing Admin locale-catalog failures remain in the one failing suite. Modified sources have zero ESLint errors.

### Subscription hydration follow-up

- PPB actual widget submission and checkout: native monthly plan price $476.10, initial bundle discount $95.22, checkout $380.88; recurring subtotal $476.10 for initial-only configuration.
- FPB configured products without cached images exposed a hydration lookup bug: the loader collected shopper selection IDs instead of canonical Shopify product IDs. Regression reproduced before the fix; category hydration and variant availability suites now pass 39 cases.
- A fresh CLI preview served the rebuilt JavaScript. FPB rendered the image-free earrings product, submitted the monthly selling plan as an unmerged component line, and reached checkout at $380.88 from Shopify's $476.10 plan price. One-time purchase merged to the parent at $529.00 without the subscription-only discount.
- PPB reached the same $380.88 subscription checkout and $476.10 recurring subtotal. Both fixtures were restored to their original revisions afterward.

### Final country and obsolete-token cleanup

- The current US market accepted the US-only PPB policy and applied B2G1. The same three units under a CA-only policy remained loose at $60 with no discount. The original PPB policy was republished afterward.
- Removed the obsolete signed-token native resource fixtures and their runner. Capacity is now covered by shared-policy Rust tests and live 50-line / 200-line Chrome evidence.
- Removed the unused `bundleDetailsKey` return value and stale token/cart-metafield mocks. Runtime source code has no custom runtime-token, line-authorization, signing-secret, or transformed-pricing receipt dependency.
