---
schema_version: 1
id: dashboard-home-status-and-metrics
title: Dashboard Home Status and Metrics Test Spec
type: test-spec
status: active
summary: Verifies the published-theme resource status list and shop-currency commercial metrics on the merchant dashboard.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - development
systems:
  - only-bundles
  - shopify
source_paths:
  - apps/OnlyBundles-app/app/routes/app/app.dashboard
  - apps/OnlyBundles-app/app/services/analytics/dashboard-commercial-metrics.server.ts
related_docs:
  - docs/app-nav-map/APP_NAVIGATION_MAP.md
  - internal docs/Shopify Integration/Theme App Extensions.md
tags:
  - dashboard
  - analytics
keywords:
  - theme app extensions
  - shop currency
---

# Test Spec: Dashboard Home Status and Metrics
**Spec ID:** dashboard-home-status-and-metrics  **Created:** 2026-09-23

## Purpose

Protect the dashboard's canonical Shopify status and commercial-metric behavior without asserting visual styling or placement.

## Test Cases

### StorefrontStatus

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Group every known resource | Five normalized resources | One app embed and four app blocks | No resources are hidden |
| 2 | Preserve Shopify status meaning | Active, available, unavailable resources | Matching status keys and badge tones | Published-theme status only |

### DashboardCommercialMetrics

| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | Same-currency attribution | Shop and attribution currencies match | Stored bundle cents retained | No conversion needed |
| 2 | Presentment attribution | Presentment and shop subtotals differ | Bundle cents converted by Shopify MoneyBag ratio | Result uses shop currency |
| 3 | Duplicate attribution | Repeated order and bundle rows | Bundle revenue counted once using the highest row | Order total counted once |
| 4 | More than 250 orders | 251 attributed order IDs | Admin nodes queried in two batches | Shopify array limit respected |
| 5 | Missing or mismatched money | Incomplete Shopify order data | Metric load rejects | No partial mixed-currency result |
| 6 | No views | Orders exist and view count is zero | Conversion is unavailable | Avoids a misleading zero rate |
| 7 | Open full analytics | Select any performance metric | Shopify embedded navigation opens `/app/attribution` in `_self` | No iframe-relative `href` |

## Acceptance Criteria

- [ ] All five theme resources remain visible and grouped by extension kind.
- [ ] Status data comes from the App Bridge theme-extension API for the published theme.
- [ ] Revenue and AOV are returned in the shop currency.
- [ ] Admin GraphQL order requests contain no more than 250 IDs.
- [ ] Metrics are deferred from the initial dashboard render.
- [ ] Every performance metric uses Shopify embedded navigation to open Analytics.
- [ ] All listed test cases pass.
