# Test Spec: Metafield Payload Slimming
**Spec ID:** metafield-payload-slimming  **Created:** 2026-09-17

## Purpose
Verify that `$app:bundle_ui_config` and associated bundle metafields are slimmed down by removing redundant fields (`descriptionHtml`, duplicate `displayOptions`, disabled upsell skeletons) and that Shopify's platform limits (64KB on `bundle_ui_config`, 10KB on function input metafields) are strictly enforced across all bundle types without breaking widget or checkout contracts.

## Test Cases

### MetafieldPayloadSlimming
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Category product compact reference omits `descriptionHtml` | Product with both `description` and `descriptionHtml` passed to `compactProductReference` via `formatStepCategoryForRuntime` | Output object contains `description` but no `descriptionHtml` | Prevents multi-kilobyte HTML bloat per product |
| 2 | Duplicated `displayOptions` omitted from `messaging` | Bundle config with `pricing.displayOptions` passed to `updateBundleProductMetafields` | `bundleUiConfig.pricing.displayOptions` is populated, `bundleUiConfig.messaging.displayOptions` is undefined/omitted | Prevents duplicating the same tree twice |
| 3 | Disabled upsell configuration compacted to `null` | Bundle config where `upsellConfiguration.isEnabled === false` and `widgetConfiguration.isEnabled === false` | `bundleUiConfig.bundleUpsellConfig` is `null` | Saves ~700 bytes of dead boilerplate skeleton |
| 4 | Active upsell configuration preserved | Bundle config where `upsellConfiguration.isEnabled === true` | `bundleUiConfig.bundleUpsellConfig` is preserved with full configuration | Preserves active upsell behavior |
| 5 | Product Page bundles enforced by 64KB limit | Product page bundle with `bundle_ui_config` exceeding 64KB (65,536 bytes) | Throws Error: `bundle_ui_config metafield exceeds Shopify's 64KB limit` | Closes loophole where `PRODUCT_PAGE` was exempted |
| 6 | Function input metafield `price_adjustment` enforced at 10,000 bytes | `price_adjustment` payload exceeding 10,000 bytes | Throws Error: `price_adjustment exceeds the Shopify Function metafield limit of 10000 bytes.` | Prevents silent Function failures |
| 7 | Function input metafield `ppb_policy_revisions` enforced at 10,000 bytes | Policy map payload exceeding 10,000 bytes | Throws Error: `Bundle policy map exceeds the Shopify Function 10KB input limit` | Already in `buildBundlePolicyMetafield` |

## Acceptance Criteria
- [ ] All listed test cases pass
- [ ] Existing `bundle-product-metafield.test.ts` passes
- [ ] Existing `bundle-config-contracts.test.ts` passes
- [ ] Storefront widgets build without errors
- [ ] Zero ESLint errors
