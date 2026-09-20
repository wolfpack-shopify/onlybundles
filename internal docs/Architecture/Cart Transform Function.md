---
schema_version: 1
id: cart-transform-function
title: Cart Transform Function
type: architecture
status: authoritative
summary: Shopify bundle Function runtime, build ownership, and the coordinated migration from signed tokens to app-owned policy metafields.
last_audited: 2026-09-20
owners:
  - engineering
domains:
  - checkout
systems:
  - bundle-cart-transform-rs
  - bundle-discount-function
  - cart-transform-service
source_paths:
  - extensions/bundle-cart-transform-rs/shopify.extension.toml
  - extensions/bundle-cart-transform-rs/src/run.graphql
  - extensions/bundle-cart-transform-rs/src/merge.rs
  - extensions/bundle-discount-function/shopify.extension.toml
  - extensions/bundle-discount-function/src/cart_lines_discounts_generate_run.graphql
  - extensions/bundle-discount-function/src/cart_lines_discounts_generate_run.rs
  - app/services/cart-transform-service.server.ts
  - app/lib/shopify-product-gid.ts
  - app/services/bundle-runtime-policy.server.ts
  - app/services/bundle-runtime-policy-publisher.server.ts
  - extensions/bundle-runtime-policy/src/lib.rs
related_docs:
  - Shopify Integration/Cart Transform API.md
  - Features/Pricing Pipeline.md
  - Architecture/Storefront Outage Resilience.md
tags:
  - architecture
  - shopify-function
keywords:
  - blockOnFailure
  - published runtime policy
  - bundle pricing
---

# Cart Transform Function

## Runtime contract

Bundle saves compile canonical merchant configuration into the app-owned shop
metafield `$app.ppb_policy_revisions`. Each active record contains the complete
shared rules and deduplicated membership definitions. Products store only an
array of references in `$app.bundle_runtime_memberships`; identical membership
sets share a reference within the revision. References are content fingerprints
of the revision and membership definition, not browser credentials. The Function
requires the reference on the actual Shopify product and resolves it only inside
the requested active bundle revision. Explicit variant allowlists remain binding.
The parent variant receives `$app.bundle_parent_policy`.

The publisher stages product and parent records, retains the active revision,
verifies Shopify readback, and then activates the new revision using
`compareDigest`. Missing, revoked or inconsistent policies receive no bundle
benefit. Collection lookup failures abort publication instead of publishing
partial membership. Runtime definitions grant merchants read access, not write
access. Save-time and deployment sync must not continue after definition failure.

PPB, FPB, SDK and checkout offer submissions send `_wpb_selection` with bundle,
revision, instance and group identifiers. These are buyer choices, not proof.
Functions validate each actual Shopify variant, quantity, price, country and
selling-plan allocation against the shared rules and that product's membership references. The shared Rust
crate owns membership, group/category totals, required defaults, tier eligibility
and pricing calculations. Split lines aggregate before quantity limits apply.

There are no bundle runtime-token endpoints, HMAC verification modules, signed
pricing receipts or cart authorization metafield writes. Unrelated Shopify OAuth,
session, app-proxy, webhook, preview and offer-link verification remain separate.
The specific-link requirement controls storefront visibility only. It does not
authorize purchase or discounts; Functions evaluate the published bundle rules.

## Representation and pricing

- Ordinary bundles without add-ons merge from selected components.
- Bundles with add-ons or gifts retain components so the Discount Function has
  actual paid component facts for tier eligibility and line discounts.
- Scheduled bundles retain components. Native discount dates enforce one-time
  schedules; recurring schedules use Shopify local-time input and published
  owner configuration. Outside the window, components remain purchasable at
  regular price.
- Subscription selections remain components and require an allowed actual
  selling-plan allocation. Native discount roles preserve initial versus
  recurring behavior.
- Dedicated parent variants have Shopify `requiresComponents: true`. Direct
  parent adds must be rebuilt through the widget; there is no self-expansion.

Discount owners publish non-secret `discount_configuration` JSON containing
roles and the required `windowStart`/`windowEnd` Function input variables. Missing
required variables fail Function execution, so existing owners also need their
configuration refreshed. Checkout integration codes must match the exact code
on their owner; a prefix is insufficient. These code discounts do not combine
with another product discount that could grant the same benefit twice.

## Cart presentation

Merged lines emit Retail Price, Bundle Price and Bundle Savings in that order.
The savings property includes both amount and percentage. Values come from
Shopify component prices and the validated pricing calculation, not browser
presentation totals. The redundant Items property is omitted because Shopify
already renders bundle components. Display-only tier progress includes the
component count and retail total, since the merged parent quantity is not the
number of selected components.

Checkout offer controls read Shopify-hosted component policies and parent display
configuration. Changes use Shopify's cart-line API and are revalidated by the
Discount Function. Analytics identifiers and optional display metadata never
serve as pricing authorization.

The Bundle Savings property is omitted when computed savings round to zero;
this also removes the zero-value property from Shopify checkout.

## Publication and development checks

The database's `runtimePolicyRevision` changes only after successful Shopify
activation. A running development process retains its Prisma client across hot
reloads; after generating a client with a new scalar field, restart the process
before trusting freshly rendered storefront configuration. Otherwise Shopify may
have the active revision while an old client omits it from database reads.

Both sync configuration builders must forward canonical required default-product
data into the compiler. FPB previously omitted it: valid default lines could not
resolve membership, while a component-only request received a benefit without
the missing requirement. A builder-to-compiler regression and live FPB/PPB
omission/duplication checks now cover this publication boundary.

Shopify native discount schedule readback truncates milliseconds. Publish
`startsAt` and `endsAt` at second precision before comparing the returned dates;
otherwise a successful native write fails an exact millisecond comparison.

For component-line discounts, Shopify rounds percentage discounts per unit.
Spreading a $20 BXY saving over three $20 units with a percentage candidate
produced a $19.98 saving in live QA. The Discount Function emits fixed amounts
with `appliesToEachItem: false` instead. Round cumulative savings per validated
instance and allocate each line the difference: independently rounding split
lines can also change the bundle total by a cent. The calculation must use
Shopify input prices and validated eligibility, never a browser pricing receipt.

Shared shop rules are bounded to 9,500 bytes. Product references, including the
previous active revision during staging, are bounded to 100 bytes. Publication
rejects unsupported overlap or rule size before writing any staged fields.
The 200-line input estimate reserves 450 bytes per ordinary Shopify line, up to
ten 512-byte selection attributes, and 3,380 bytes for the owner configuration
and envelope. This is an explicit supported-input budget, not a guarantee for
arbitrarily large buyer-controlled display attributes. The Function retains the
ten-selected-line execution guard. Collection reconciliation and the remaining
commercial UI matrix remain release acceptance checks.

The former complete-policy-per-product layout failed live QA: fifty ordinary
Roasted lines generated 154,765 input bytes and Shopify rejected the cart before
Function execution (128,000-byte limit). With shared rules and compact product
references, the same 50-line Chrome request succeeded at 24,564 bytes; a 200-line
request succeeded at 91,826 bytes and $4,000. Evidence:
`.shopify/logs/20260919_195907_137Z_extensions_bundle-cart-transform-rs_e29d9b.json`
and `.shopify/logs/20260919_195927_198Z_extensions_bundle-cart-transform-rs_499243.json`.
Those measurements contain the current two QA bundles; they do not establish
unbounded bundle overlap, catalogue size, or selection-attribute capacity.

On 2026-09-19, live Chrome PPB QA using widget 24.0.0 added one Roasted and two
Peri Peri cashews at $20 each as one $40 merged line. Cart properties displayed
Retail Price $60.00, Bundle Price $40.00, Bundle Savings $20.00 (33.33%), without
Items. Both fixtures were backfilled through normal SIT sync. FPB reached
checkout with three $20 units at $60; its zero-savings property is omitted.
Both widget submissions succeeded with app fetches blocked after loading.
Chrome cart checks rejected direct parent adds and withheld benefits for forged
roles/groups and stale revisions. Split lines and multiple instances retained
correct pricing. The FPB add-on fixture discounted only the eligible tier and
withheld benefits below its threshold or above its quantity ceiling. The same
component fixture cost $50 during its native scheduled window and $60 after
expiry, without blocking purchase. An existing Shopify selling plan supplied a
$476.10 component price; the published 20% bundle rule produced $380.88 under
both initial and recurring owner configurations. Its one-time purchase stayed
at $529.00 when the rule targeted subscriptions only. This verifies cart pricing,
not a future subscription renewal charge. Fixture configuration was restored
after each commercial group. Live checkout-code and checkout-offer controls
remain to be verified; Function tests cover exact native owner code matching,
missing/forged codes, and revoked revisions.

Build ownership and stale Shopify preview recovery are documented in
[[Operations/Build Process]]. Shopify CLI owns ABI adaptation and final
optimization; do not restore the broad panic-snipping pass that caused an
immediate WASM trap. Deployment remains a manual gate.

## Shopify references

- [Bundle app guidance](https://shopify.dev/docs/apps/build/product-merchandising/bundles/create-bundle-app)
- [Function metafield inputs](https://shopify.dev/docs/apps/build/functions/input-queries/metafields-for-input-queries)
- [Owner input variables](https://shopify.dev/docs/apps/build/functions/input-queries/use-variables-input-queries)
- [Function resource limits](https://shopify.dev/docs/api/functions/2026-01)

Storefront preview pricing must use the same component scope as the Functions.
Optional add-ons are included in the retail subtotal but excluded from base bundle
pricing and its quantity/amount thresholds. The shared purchase-option calculator
prices paid selections (including defaults) first; the existing add-on calculation
then contributes only the selected add-on saving. Live FPB QA caught a $25 preview
versus $45 checkout mismatch when a $35 fixed bundle and a half-price $20 add-on
were both applied to the full subtotal. After correcting the shared calculator,
FPB and PPB previews and Shopify cart all report $45.

### Storefront hydration and add-on completion

FPB hydration must collect canonical `steps[].products[].id` values, including category products. Shopper selection identifiers are created later and cannot identify persisted products for Storefront API hydration. Image-free configured products exercise this path; image-rich cached products can hide an incorrect lookup.

Both widgets evaluate active add-on tier conditions before quantity changes and submission. Empty optional add-ons remain valid; selected add-ons must satisfy their tier conditions, and their quantities and amounts cannot qualify their own paid-component eligibility thresholds.
