---
schema_version: 1
id: uninstall-cleanup
title: Uninstall and Shop Redact Cleanup
type: test-spec
status: active
summary: Verify transactional operational cleanup on uninstall and complete erasure on Shopify shop redact.
last_audited: 2026-09-25
owners:
  - engineering
domains:
  - webhooks
systems:
  - only-bundles
  - shopify
source_paths:
  - app/services/shop-data-cleanup.server.ts
  - app/services/webhooks/handlers/lifecycle.server.ts
  - app/services/webhooks/handlers/gdpr.server.ts
related_docs:
  - internal docs/Shopify Integration/Webhooks.md
tags:
  - uninstall
  - gdpr
keywords:
  - app/uninstalled
  - shop/redact
---

# Test Spec: Uninstall and Shop Redact Cleanup

**Spec ID:** uninstall-cleanup  **Created:** 2026-07-10

## Purpose
Verify that the app uninstall webhook removes shop-owned operational data while preserving revenue analytics needed after churn, and that Shopify's shop-redact webhook removes all remaining shop-owned data.

## Test Cases
### LifecycleWebhook
| # | Scenario | Input | Expected Output | Notes |
|---|---|---|---|---|
| 1 | App uninstall cleanup runs | `shopDomain`, payload, current webhook event id | Deletes bundles, sessions, design settings, queued jobs, compliance records, old webhook events, old business events, and shop record | `OrderAttribution` and `BundleEngagement` are intentionally untouched |
| 2 | Cleanup is atomic | A database deletion fails | Transaction rolls back | Avoids retaining a partially deleted operational footprint |
| 3 | Uninstall event is retained | Same as #1 | Old `BusinessEvent` rows are deleted before `app_uninstalled` is recorded | Keeps the final uninstall marker after cleanup |
| 4 | Shop redact is complete | `shopDomain`, payload, current webhook event id | Deletes operational data, retained analytics, and every webhook event including the current event | The processor tolerates the current event disappearing after successful handling |

## Acceptance Criteria
- [ ] All listed test cases pass
- [ ] Fleet cleanup requires two-source Shopify evidence and the exact reviewed audit ID
- [ ] The temporary fleet repair runner is removed after SIT and production verification complete
