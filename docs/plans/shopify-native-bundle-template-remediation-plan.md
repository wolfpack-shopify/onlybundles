---
schema_version: 1
id: shopify-native-bundle-template-remediation-plan
title: Shopify-Native Bundle Template Remediation Plan
type: implementation-plan
status: approved
summary: Lean plan to correct native product selection and remediate responsive FPB and PPB template defects without replacing established render, preview, persistence, or synchronization architecture.
last_audited: 2026-09-24
owners:
  - engineering
domains:
  - admin
  - storefront
systems:
  - only-bundles
  - shopify
source_paths:
  - apps/OnlyBundles-app/app/routes/app/_shared/bundle-configure/CommonStepCategoryAccordion.tsx
  - apps/OnlyBundles-app/app/routes/app/shared/storefront-sync-action.server.ts
  - apps/OnlyBundles-app/app/assets/widgets
  - apps/OnlyBundles-app/app/routes/root/settings-design-preview-frame/route.tsx
related_docs:
  - internal docs/Architecture/Widget Architecture.md
  - internal docs/Architecture/Storefront Draft Preview Authorization.md
  - internal docs/Architecture/Product Card Layout Contract.md
  - internal docs/Shopify Integration/Theme App Extensions.md
tags:
  - remediation
  - storefront
  - templates
  - shopify-native
keywords:
  - resource-picker
  - preview-bundle
  - FPB
  - PPB
  - responsive-css
---

# Shopify-Native Bundle Template Remediation Plan

## 1. Objective and boundaries

Correct the Shopify Product Resource Picker variant preselection defect, then remediate proven responsive defects in the eight supported FPB and PPB templates within the repository's current architecture.

Use Shopify's canonical surfaces and contracts:

- [Resource Picker API](https://shopify.dev/docs/api/app-home/v1.0/apis/user-interface-and-interactions/resource-picker-api) for Admin product and variant selection.
- [Theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions) and [app blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks) for storefront placement and assets.
- The existing authenticated app proxy, preview-token flow, save-time synchronization, and general sync tooling for their established responsibilities.

Preserve the current template registry, FPB and PPB controllers, shared product-card renderer, production-backed Settings Design preview, persistence contracts, and public identifiers. Make the smallest change at the owner of each demonstrated defect.

The following work is explicitly out of scope:

- Synchronizing bundles before preview, adding a `preview` sync reason, or changing `prepare-preview` into a write operation.
- Replacing or converging the existing renderers solely for architectural uniformity.
- Rebuilding Settings Design preview or introducing another preview renderer.
- Forcing all template geometry into one CSS owner when templates have genuine layout differences.
- Removing geometry controls or changing Prisma, metafield, metaobject, snapshot, or value-writing contracts.
- Template usage analysis, merging, retirement, or identifier remapping.
- Per-template user approval gates, test-spec files for CSS-only changes, or exhaustive state matrices unrelated to the affected behavior.

## 2. Current architecture to retain

- `TemplateDesignSystem` remains the template-selection and token owner.
- The existing FPB and PPB registries and controllers remain the surface owners.
- The existing shared product-card renderer remains the common product presentation owner.
- The isolated Settings Design preview continues to import the production renderers and storefront CSS; it must not grow a parallel layout implementation.
- Preview remains read-only: it validates the saved bundle identity and returns a signed preview URL without synchronizing or mutating bundle data.
- Save Bundle, Sync Bundle, and deployment general sync remain the synchronization owners.
- All eight supported public template identifiers remain stable.

If a live defect disproves one of these assumptions, stop and scope that defect from evidence rather than expanding this plan pre-emptively.

## 3. Phase 1 — Native product-picker correction

Use Shopify Resource Picker `selectionIds` exactly as documented:

- Pass each saved product GID.
- Under that product, pass only its saved variant GIDs.
- Treat the picker result as the authoritative selection output.
- Do not create custom picker state, legacy ID mappings, or fallback selection rules.

Required behavior coverage:

- Reopening a partially selected multi-variant product selects exactly the saved variants.
- Reopening an all-variant selection selects every saved variant.
- Removing a variant persists and reopens with the reduced selection.
- Single/default-variant products remain selectable.
- Multiple products retain independent variant selections.
- Saving and reloading preserve the exact selected set.

Verification:

- Run the focused picker behavior test.
- Run TypeScript validation if the modified path is typechecked.
- Run ESLint on modified implementation and test files with zero errors.
- Verify the original Admin flow in Chrome and confirm exact variant preselection.

## 4. Phase 2 — Preview verification only

Do not change preview architecture unless current behavior fails under a reproducible case.

Verify that:

- FPB and PPB preview actions return the correct environment-specific app-proxy URL.
- The signed preview token and saved bundle identity are sufficient for rendering.
- Existing unsaved-change, app-embed, product-template, placement, popup-blocked, and popup-closed handling still works.
- Preview does not call storefront synchronization or change persisted bundle state.

If a saved fixture is stale, repair it through the existing Save Bundle or Sync Bundle workflow. Use deployment general sync only when a broad environment repair is actually required. Do not make preview responsible for synchronization.

A preview-only failure must be documented with its exact request, response, console, network, and saved-data evidence before any code change is added to this phase.

## 5. Phase 3 — Template remediation

Review and remediate templates in this order:

1. FPB Standard
2. FPB Classic
3. FPB Compact
4. FPB Horizontal
5. PPB Product List
6. PPB Product Grid
7. PPB Horizontal Slots
8. PPB Vertical Slots

For each template:

1. Reproduce and record the actual defect before editing.
2. Identify whether the defect belongs to shared product-card CSS, the FPB or PPB surface, or the template-specific stylesheet.
3. Fix shared CSS only when the defect is genuinely shared. Keep template-specific layout differences in their existing owners.
4. Remove dependence on the host theme's root font size only from layout-defining widths, tracks, and breakpoints. Do not perform a blanket `rem` replacement.
5. Prefer the existing named containers, container queries, intrinsic grid tracks, and responsive tokens. Retain the existing `ResizeObserver`-based summary mode; do not add viewport polling or resize listeners.
6. Keep static presentation in CSS and behavior/state in JavaScript or TypeScript.
7. Do not rewrite a passing renderer or template as part of a neighboring fix.
8. Let the Settings Design preview receive production CSS changes through its current imports. Change preview code only for a separately proven preview-only defect.

The Agent theme is regression evidence, not a source of fixed geometry. Translate any measured failure into content- and container-responsive rules rather than copying captured pixel dimensions.

## 6. Phase 4 — Bundle template CSS simplification

Retain all eight public templates and their current renderers while simplifying
the Chrome-verified CSS ownership boundaries. This phase does not change routes,
Shopify blocks, Prisma, metafields, synchronization contracts, merchant settings,
or app-proxy behavior.

### Product-card divider contract

- The shared product-card renderer is the sole owner of the conditional variant
  row and its existing data marker.
- Render the row only for meaningful, non-default variant text in both selected
  and unselected cards. Do not render a divider element, pseudo-element, or empty
  divider band.
- The variant row owns its logical `1px` start border through
  `--bundle-product-card-variant-divider`, plus the existing bounded margin,
  padding, and single-line truncation.
- Remove the redundant FPB Standard post-processing path and its obsolete
  expanded-variant selectors. Keep FPB and PPB card CSS in their separate surface
  owners; do not add a generic cross-surface product-card stylesheet.

### PPB container-responsive geometry

- The PPB in-page root is a named inline-size container.
- Product List uses an intrinsic bounded action track based on the PPB container,
  `clamp(90px, 28cqi, 112px)`, instead of viewport-switched `90px` and
  `112px` widths.
- Product List typography and internal spacing respond to container width.
- Viewport-owned sticky-footer activation, safe-area padding, and mobile drawer
  height retain the runtime's `max-width: 767px` boundary. Modal, pointer, and
  accessibility media queries remain unchanged without a separately reproduced
  defect.

### FPB cascade ownership

- The FPB base card stylesheet retains one selected, unselected, and hover card
  geometry rule. Remove later identical blocks and repeated selectors in that
  same file.
- Retain the final Standard and Classic resets required by preset asset load
  order. Do not replace them with `!important` or higher-specificity selectors.
- Scope the Standard token declaration to the FPB root while retaining the nested
  preset attribute used by template selectors.
- Where `text-align: start` immediately owns the same declaration, remove the
  redundant preceding `text-align: left`.

### Shared loading primitive

- One shared source partial owns loading visibility, GIF sizing, spinner styling,
  and spinner keyframes. Import it into the FPB and PPB CSS entrypoints.
- Overlay shells remain surface-owned: FPB is viewport-fixed and PPB is
  component-absolute.
- Continue emitting readable CSS with `npm run build:css`; do not add another
  minification layer.

### Host-theme-independent FPB geometry and typography

- Treat the current 16px-root Design Control Panel geometry as the explicit
  numeric component contract without making Horizon's unrelated theme styling
  canonical. Dawn's 10px document root and Horizon's 16px document root remain
  untouched.
- Use a `44px` shared interaction target for product, quantity, variant, Back,
  and primary actions. Standard icon CTA mode keeps its `35px` visual treatment
  inside that `44px` interactive box; the compact Clear action remains `30px`.
- Express fixed card tracks, summary rows, gaps, thumbnails, action widths, and
  pixel-bounded container clamps without root-relative units. Preserve `cqi`,
  intrinsic tracks, percentages, and the existing named containers where they
  own responsiveness.
- Normalize only the active FPB catalog cards, variant and quantity controls,
  desktop sidebar, and mobile tray or sheet. Do not blanket-convert product
  modals, toasts, animation, pointer, or unrelated decorative rules without a
  separately reproduced defect.
- Keep merchant font sizes and weights authoritative. Use the configured
  `--wpb-controls-font-family` when present; otherwise inherit the host theme's
  font family consistently across FPB cards, summaries, buttons, and selects.
  FPB continues to own font sizes, weights, line heights, and layout geometry.
- Use unitless line heights for text that follows merchant font-size tokens and
  explicit pixel letter spacing where required. Native form controls must not
  fall back to the browser-default Arial family.

### Phase 4 verification

Use two unpublished SIT-only themes: a fresh Dawn installation and an unpublished
duplicate of the current Horizon theme. Enable only the SIT embed and relevant
SIT product block; never publish either theme or enable PROD resources.

After each implementation slice, run the affected focused checks and CSS build,
then use a fresh Shopify preview handle before accepting live evidence. Confirm
the Dev Console is connected, affected assets return `200`, the served widget
version matches the completed build, the SIT proxy root is active, and no PROD
embed owns the document.

Divider QA covers FPB Standard, Classic, Compact, and Horizontal; PPB Product
List and Product Grid; and regression smoke coverage for both slot templates.
Exercise real, default, and missing variants; selected and unselected states;
variant selectors enabled and disabled; and long titles and variant labels. Card
height may change by no more than `1px` on selection, with price/action baselines
aligned and no clipping, orphan divider, duplicate row, or horizontal overflow.

Responsive QA uses actual Chrome device emulation at `390`, `768`, `1024`, and
`1440` viewport widths while recording the widget container width. Explicitly
test the `767/768px` viewport boundary plus narrow and wide PPB containers.

Automated gates are the focused shared-card Jest tests, `npm run typecheck`,
modified-file ESLint, `npm run build:css` after each CSS slice, and
`npm run build:widgets` after removing the FPB post-processing path. Bump the
widget version once for the completed phase, run `node --check` on every rebuilt
storefront JavaScript asset, verify compressed CSS remains below Shopify's
guidance, and finish with `git diff --check`.

Final completion requires all eight templates to pass desktop and mobile smoke
checks in both QA themes, including selection, variant changes, quantity controls,
summaries or drawers, keyboard focus, console checks, and network checks. Keep
screenshots outside the repository.

## 7. Verification matrix

### Automated verification

For the picker change:

- Focused behavior tests.
- Typecheck when applicable.
- Modified-file ESLint.
- `git diff --check`.

For CSS-only template changes:

- Assemble the affected readable extension CSS with `npm run build:css`; Shopify owns delivery minification.
- Do not create unit tests or test-spec files for styling, class names, dimensions, or element placement.
- Run `git diff --check`.

For storefront JavaScript or TypeScript changes:

- Add focused behavior coverage before implementation when behavior changes.
- Build only the affected storefront source graph.
- Run `node --check` on each affected generated JavaScript asset.
- Run typecheck and modified-file ESLint as applicable.

### Browser verification

Use two unpublished SIT-only theme contexts:

- A fresh Shopify Dawn installation.
- An unpublished duplicate of the current Horizon theme.

Smoke all eight templates at desktop and mobile widths in both themes. Exercise the complete shared behavior once for each distinct surface:

- FPB full-page.
- PPB in-page.
- PPB modal.

Add a tablet/constrained-width pass only when the changed rule affects an intermediate breakpoint or when desktop/mobile evidence exposes a transition risk.

For each affected surface, verify:

- Current local widget version and successful extension asset responses.
- Correct SIT proxy root and no competing PROD runtime owner.
- Loading completes without console errors, failed requests, ORB failures, or horizontal overflow.
- Product selection, variant selection, quantity changes, validation, and summary behavior still work.
- Keyboard and focus behavior still work for changed interactive surfaces.
- PPB modal containment, close behavior, and focus return still work when the modal surface is affected.

If the storefront is attached to an obsolete Shopify development preview handle, reopen it from the active Admin or CLI preview before evaluating application behavior. Treat stale preview delivery as environment evidence, not as a reason to add application fallbacks.

## 8. Synchronization and persisted contracts

No Prisma, metafield definition, metaobject definition, snapshot schema, app-proxy contract, or storefront value-writing change is planned.

Therefore:

- Do not modify deployment general-sync code for this remediation.
- Do not add synchronization to Preview Bundle.
- Do not add a new synchronization reason.
- Do not run general sync merely to prepare a preview.

If implementation reveals that a persisted or storefront-writing contract must change, pause this plan and document the evidence. Replan that contract change separately, including the smallest required update to the existing general sync service and its focused behavior tests.

## 9. Public contract changes

- Public template identifiers: unchanged.
- `StorefrontSyncReason`: unchanged.
- `prepare-preview`: unchanged and read-only.
- App proxy roots: unchanged; PROD and SIT remain distinct.
- Routes, Prisma schema, metafield/metaobject definitions, storefront snapshot shape, and value-writing contracts: unchanged.
- Settings Design preview architecture: unchanged.
- Product Resource Picker input: corrected to include exact saved variant-level `selectionIds`.

## 10. Commit and release approach

Keep commits cohesive and limited to verified ownership boundaries:

1. Product-picker behavior.
2. FPB responsive fixes.
3. PPB responsive fixes.
4. Durable documentation updates, only when implementation changes an established architecture fact or records a reusable Shopify gotcha.

Preserve unrelated worktree changes and inspect generated output before staging. Production and SIT deployment remain manual. After the user deploys to SIT, verify the released asset version and representative FPB, PPB in-page, and PPB modal flows before production handoff.

## 11. Completion criteria

- Reopening Shopify's Product Resource Picker selects exactly the saved variants.
- Preview Bundle remains a read-only, authenticated URL-preparation flow and requires no new pre-preview sync.
- FPB Standard and any other affected template respond to their available container instead of the host theme's root font size.
- All eight templates pass desktop and mobile smoke checks in the fresh Dawn and unpublished Horizon-copy SIT themes.
- FPB, PPB in-page, and PPB modal each pass one complete shared behavior check.
- Settings Design preview reflects the production renderer and CSS without a new preview implementation.
- No compatibility shim, parallel renderer, speculative abstraction, new sync path, or unnecessary persisted-contract change is introduced.
- Required focused automated checks, affected builds, and browser verification pass.
