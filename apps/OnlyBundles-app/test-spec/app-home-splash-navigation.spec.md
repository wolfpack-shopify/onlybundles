---
schema_version: 1
id: app-home-splash-navigation
title: Test Spec - App Home Splash Navigation
type: test-spec
status: active
summary: Verifies the first-entry splash and Shopify-owned app-name navigation to the dashboard on later visits.
last_audited: 2026-09-23
owners:
  - engineering
domains:
  - admin
systems:
  - remix-routes
source_paths:
  - apps/OnlyBundles-app/app/routes/app/app._index.tsx
  - apps/OnlyBundles-app/app/routes/app/app.tsx
related_docs:
  - docs/app-nav-map/APP_NAVIGATION_MAP.md
tags:
  - app-home
  - navigation
keywords:
  - splash
  - dashboard
---

# Test Spec: App Home Splash Navigation
**Spec ID:** app-home-splash-navigation  **Created:** 2026-09-23

## Purpose
Verify that Shopify owns the app-name home link, the first app entry shows a native Only Bundles splash, and later app-name visits in the same Admin tab open the dashboard.

## Test Cases
### AppHomeSplashNavigation
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | First app entry | `/app` with no session marker | Centered Only Bundles splash, concise value statement, and dashboard action render | Marker is recorded for the current Admin tab |
| 2 | Splash action | Merchant activates `Take me to my dashboard` | Navigate to `/app/dashboard` | Uses the native primary button |
| 3 | Later app-name visit | `/app` with the session marker | Replace-route to `/app/dashboard` | Splash does not render again in that tab |
| 4 | Admin sub-navigation | Authenticated app shell | No Dashboard child link is registered | Shopify's app name remains the home link |

## Acceptance Criteria
- [x] First `/app` entry in an Admin tab shows the centered native Only Bundles splash and concise value statement.
- [x] The splash action opens `/app/dashboard`.
- [x] Later `/app` visits in the same Admin tab replace-route to the dashboard.
- [x] `<s-app-nav>` contains sub-navigation only and does not add a Dashboard item.
