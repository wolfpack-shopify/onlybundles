---
schema_version: 1
id: storefront-draft-preview-authorization
title: Storefront Draft Preview Authorization
type: architecture-decision
status: accepted
summary: Draft FPB and PPB storefront previews use one 1-hour stateless token bound to the shop and bundle.
last_audited: 2026-09-25
owners:
  - engineering
domains:
  - storefront
  - admin
systems:
  - bundle-preview
  - app-proxy
source_paths:
  - app/lib/bundle-preview-token.server.ts
  - app/lib/bundle-preview-url.ts
  - app/routes/api/api.bundle.$bundleId[.]json.tsx
  - app/routes/root/wpb.$bundleId.tsx
  - app/routes/app/shared/storefront-sync-action.server.ts
  - app/assets/widgets/product-page/methods/config-lifecycle-methods.ts
  - app/assets/widgets/shared/storefront-analytics.ts
related_docs:
  - Architecture/FPB Host Evaluation.md
  - Architecture/Widget Architecture.md
tags:
  - preview
  - security
  - fpb
  - ppb
keywords:
  - wpb_preview
  - draft bundle
  - signed preview
---

# Storefront Draft Preview Authorization

## Decision

Draft FPB and PPB previews use the same 1-hour (60-minute) stateless `wpb_preview` token (`BUNDLE_PREVIEW_TOKEN_TTL_MS = 60 * 60 * 1000`). The token is HMAC-signed from `SHOPIFY_API_SECRET` and binds version, shop domain, bundle ID, and expiry. Authenticated Admin preview preparation is read-only: it validates the saved bundle identity, requires FPB `publicNumber`, and mints the token without publishing or synchronizing storefront state.

Active and unlisted bundles remain public. Draft bundles require a valid token. Archived, missing, cross-shop, expired, tampered, and cross-bundle requests return `404` so callers cannot distinguish private state from absence.

## Host flow

FPB places the token on the canonical signed app-proxy document URL. The FPB document route verifies both Shopify's app-proxy signature and the bundle preview token before rendering draft configuration.

PPB places the token on the Shopify product preview URL. The product-page widget forwards only `wpb_preview` to its bundle configuration request when present in the URL search params. Shopify signs that app-proxy request, and the API verifies the proxy shop before verifying the preview token. Other Shopify preview parameters stay on the product URL and are not forwarded to the app proxy. Admin Dashboard and Configure actions append `?wpb_preview={token}` automatically when triggering storefront previews for bundles in draft state.

## Caching and persistence

Preview tokens are not stored in Prisma, metafields, local storage, or app events. Authorized draft API responses use `Cache-Control: private, no-store` and do not participate in conditional public caching. Public active and unlisted responses retain their existing short cache policy.

The prepare client posts only the dedicated resource route. A route or network failure closes the synchronously reserved preview tab and surfaces the operation error; it never retries against the configure document or opens an unsigned fallback URL.

Storefront locations carrying `wpb_preview` are excluded from bundle views, engagement beacons, and storefront analytics events. On ordinary storefront visits, load-time analytics are scheduled only after the page load boundary and an idle opportunity; critical bundle configuration and product data remain on the widget initialization path.
