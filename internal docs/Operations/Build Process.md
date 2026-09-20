---
schema_version: 1
id: build-process
title: Build Process
type: operations
status: authoritative
summary: Global Shopify CLI, Function, asset, lint, and pre-commit requirements for deployable application and storefront builds.
last_audited: 2026-09-19
owners:
  - engineering
domains:
  - operations
systems:
  - asset-pipeline
source_paths:
  - apps/OnlyBundles-app/scripts/build-storefront.mjs
  - apps/OnlyBundles-app/scripts/build-cart-transform-function.mjs
  - apps/OnlyBundles-app/scripts/build-discount-function.mjs
  - apps/OnlyBundles-app/extensions/bundle-cart-transform-rs/Cargo.toml
  - apps/OnlyBundles-app/extensions/bundle-discount-function/shopify.extension.toml
  - apps/OnlyBundles-app/scripts/minify-assets.js
  - apps/OnlyBundles-app/scripts/rebuild-graphify.mjs
  - apps/OnlyBundles-app/scripts/rebuild-graphify-core.cjs
  - .graphifyignore
  - .githooks/pre-commit
  - .githooks/post-commit
  - .githooks/post-checkout
  - .gitattributes
related_docs:
  - internal docs/index.md
tags:
  - build
  - storefront-assets
keywords:
  - global Shopify CLI
  - widget bundles
  - css minification
---

# Build Process

## Global Shopify CLI

Use the globally installed `shopify` executable directly for Shopify-owned
validation. Do not route Shopify CLI commands through `npx`, `pnpx`, or a local
package dependency.

```bash
command -v shopify
type -a shopify
shopify version
shopify app build --help
```

The executable path belongs to the active Node installation and can change when
the Node version changes, so scripts and documentation must call `shopify` from
`PATH` rather than hardcoding its absolute path. The initial 2026-09-09
investigation used global CLI 4.7.1.

There must be one active global CLI owner. On 2026-09-09, `type -a shopify`
found npm/NVM CLI 4.7.1 and Homebrew CLI 3.87.0. Although the parent command
reported 4.7.1, verbose output launched the Homebrew binary for a subprocess
and sent API metadata identifying CLI 3.87.0. The mixed state also made
`app config validate` appear in command discovery but fail as unavailable, and
made app builds reject supported `events`, `metafields`, `order`, `shop`, and
`sidekick` sections.

The npm/NVM CLI was isolated first. It validated PROD and SIT with zero issues
and completed the full SIT app build, including both Functions, Sidekick, theme,
checkout, product-configuration, and pixel extensions. Only after that proof
was Homebrew CLI 3.87.0 unlinked. The live SIT dev process and Cloudflare tunnel
then resolved from the npm/NVM 4.7.1 installation, and a normal post-unlink SIT
configuration validation passed.

A later `app config validate` automatically upgraded the CLI. The command began
from NVM-owned 4.7.1, installed 4.8.0 under `/opt/homebrew`, and left the older
NVM path present. On 2026-09-10, the global command resolved to 4.8.0, validated
both PROD and SIT configuration files with zero issues, and completed the full
SIT app build. The Discount Function and Cart Transform compiled to optimized
WASM outputs of 206,933 bytes and 280,301 bytes respectively; the theme,
checkout, product-configuration, pixel, and Sidekick extensions also built.
After the build, a cache-bypassed Agent-store PPB configure reload completed
through the live SIT tunnel and the Shopify Dev Console remained connected with
the Function and extension surfaces registered. The older NVM-owned 4.7.1
package was then removed with explicit user approval. `type -a shopify` now
resolves only `/opt/homebrew/bin/shopify`, which reports 4.8.0.
Re-run `command -v`, `type -a`, and `shopify version` after every automatic
upgrade; do not assume a previously consolidated installation remains
consolidated.

Treat dev, auth, or schema results from any future mixed state as unreliable.
Do not pin an absolute executable inside project scripts; remove or unlink a
dormant installation only with explicit user approval after the retained CLI
passes configuration validation and a full non-deploy app build. Then clear the
shell command cache and verify `type -a shopify` and `shopify version` again.

Run a full `shopify app build` only when `shopify app dev` is stopped. In the
global CLI 4.7.1 workflow observed on 2026-09-09, starting a standalone build
beside the active SIT dev process rewrote `.shopify/dev-bundle` rather than an
independent deploy bundle. The Shopify Admin Dev Console immediately lost its
**Connected** state even though the CLI, Remix, and Cloudflare processes stayed
alive. Treat the shared bundle directory as single-writer state: stop dev,
build, then restart `npm run dev:sit` and open that session's fresh preview.

## Widget Bundles

Source files use ES modules. Must be bundled to IIFEs for Shopify extension use.

```bash
npm run build:widgets              # all widgets
npm run build:widgets:full-page    # FPB only
npm run build:widgets:product-page # PDP only
```

### Source → Output

| Source | Output |
|---|---|
| `apps/OnlyBundles-app/app/storefront/full-page.ts` | `apps/OnlyBundles-app/extensions/bundle-builder/assets/bundle-widget-full-page-bundled.js` |
| `apps/OnlyBundles-app/app/storefront/product-page.ts` | `apps/OnlyBundles-app/extensions/bundle-builder/assets/bundle-widget-product-page-bundled.js` |
| `apps/OnlyBundles-app/app/storefront/sdk.ts` | `apps/OnlyBundles-app/extensions/bundle-builder/assets/wolfpack-bundles-sdk.js` |
| `apps/OnlyBundles-app/app/storefront/app-embed.ts` | `apps/OnlyBundles-app/extensions/bundle-builder/assets/bundle-app-embed.js` |

**Both source AND bundled files must be committed.**

`apps/OnlyBundles-app/scripts/build-storefront.mjs` is the only JavaScript asset producer. esbuild follows ESM imports from each entry and emits minified IIFEs; `apps/OnlyBundles-app/scripts/minify-assets.js` owns CSS only. Widget controllers and method modules import shared primitives directly from `apps/OnlyBundles-app/app/assets/widgets/shared/`; do not introduce compatibility barrels or rely on browser globals to satisfy module dependencies. Do not add manual module arrays, import stripping, source concatenation, or a second JS minification pass.

Keep split source modules semantically named by responsibility. Mechanical split names such as `chunk-01.js` or `part-01.css` are not acceptable long-term source structure.

## Cart Transform WASM

```bash
npm run build:cart-transform
shopify app function build --path apps/OnlyBundles-app/extensions/bundle-cart-transform-rs
wc -c apps/OnlyBundles-app/extensions/bundle-cart-transform-rs/target/wasm32-unknown-unknown/release/bundle_cart_transform_rs.wasm
```

Shopify requires the final Function WASM to be under 256 kB. This repository
uses a conservative acceptance threshold of 256,000 bytes so the check does
not depend on decimal-versus-binary unit interpretation. Use the size left by
`shopify app function build`, because Shopify CLI applies
its compatible final optimizer after the Cargo build. The larger raw Cargo
size printed by either `npm run build:cart-transform` or
`shopify app function build` is not the upload artifact. On 2026-09-09, the
CLI printed `280301 bytes` and completed successfully; the configured output
path contained the Shopify-optimized 250,491-byte WASM. Always verify that
configured path with `wc -c` before diagnosing a size-limit failure.
WASM output is not committed.

A successful app build is not proof that the Function query or executable works
in preview. In the 2026-09-19 investigation, preview rejected a Cart Transform
query with complexity 33 after the app build passed. Consolidating the shopper
selection identifiers into one bounded JSON attribute reduced the query to the
maximum cost of 30; that attribute contains identifiers, never pricing rules.
Removing the obsolete direct-parent self-expansion fields subsequently reduced
the query below that limit. Dedicated parent variants require widget selections;
their `requiresComponents` protection remains enabled.

Also replay the final WASM through Shopify CLI before treating the build as
verified. Broad `wasm-snip --snip-rust-panicking-code` removes
`std::panicking::set_hook`, which Shopify's Rust wrapper calls on every execution.
The optimizer can collapse the exported function to an immediate `unreachable`:
a suspiciously small binary then passes build while every cart execution traps
after five instructions. This was confirmed in both replay and the preview's
`.shopify/logs` Function output. Preserve the panic initialization path.

The raw Rust module imports `shopify_function_v2` functions. Shopify CLI applies
its ABI trampoline before optimization; running the unadapted Cargo artifact
directly in function-runner can report unknown imports. That is separate from
the panic-snipping trap. Keep ABI adaptation and optimization owned by Shopify
CLI, and inspect the final configured output file. For isolated diagnostics,
use the trampoline and runner bundled with the same installed CLI.

The Function crates pin `serde_json` to `1.0.146`. Version `1.0.147` replaced
Ryū with Żmij for float formatting, while Shopify SDK 2.2.0 still uses Ryū.
Linking both formatters increased this Cart Transform beyond the upload limit.
With the shared formatter and self-expansion removed, the active preview artifact
measured 254,039 bytes on 2026-09-19 and successfully replayed the three-unit
buy-two-get-one fixture. This is executable evidence, not proof that storefront
cart acceptance or the complete policy migration has passed. Re-measure and
replay before upgrading the pin; do not compensate with panic snipping.
See the [serde_json 1.0.147 release](https://github.com/serde-rs/json/releases/tag/v1.0.147).

Both Function watch lists include the shared policy crate and GraphQL queries,
so the running dev preview rebuilds when either input contract changes.

Successful SIT Function logs do not exclude a failure in another installed app.
On 2026-09-19, ordinary Ajax cart additions returned HTTP 422 even though both
SIT Functions succeeded. A diagnostic Storefront `cartCreate` returned
`MERCHANDISE_LINE_TRANSFORMERS_RUN_ERROR`. The Admin `cartTransforms` query is
scoped to the querying app, so the SIT query did not show the production app's
separate transform on the same QA store. Streaming production-app failure logs
for that specific store exposed a five-instruction Cart Transform trap with
`blockOnFailure: true`. Theme embed isolation does not disable installed backend
Functions. Inspect each relevant app's registration and logs before changing
SIT pricing code or weakening its failure handling. Removing another app's
registration requires explicit approval and a restoration plan; do not uninstall
the app to isolate a preview.
See [cartTransforms ownership](https://shopify.dev/docs/api/admin-graphql/latest/queries/cartTransforms).

The Discount Function build owner deliberately pins rustup's stable Cargo and
Rustc together because Homebrew Rust can precede rustup in `PATH` while the WASM
standard library is installed only under rustup:

```bash
node apps/OnlyBundles-app/scripts/build-discount-function.mjs
```

Keep the extension TOML command as a plain executable plus arguments. Do not put
shell assignments, pipes, or command substitutions in `extensions.build.command`;
Shopify CLI owns the command runner and must not be required to emulate an
interactive shell. Resolve dynamic tool paths and environment variables inside
the Node build owner, matching the Cart Transform build convention.

Do not use panic snipping or replace Shopify CLI's optimizer. The supported
size controls are the release profile, narrow GraphQL input, compact signed
authorization fields, and avoiding heavyweight collections when bounded
Function inputs already have stable cart-line indices or small lists.

## CSS Size Limit

Shopify enforces **100,000 B** on app block CSS assets.

```bash
wc -c apps/OnlyBundles-app/extensions/bundle-builder/assets/*.css
```

Do not fix an oversized file by making source CSS unreadable. Reduce the base asset by deleting unused/conflicting selectors and moving template-specific CSS into separately generated extension assets. Current split assets:

| Base asset | Template assets |
|---|---|
| `bundle-widget-full-page.css` | `bundle-widget-full-page-standard.css`, `bundle-widget-full-page-classic.css`, `bundle-widget-full-page-compact.css`, `bundle-widget-full-page-horizontal.css` |
| `bundle-widget.css` | `bundle-widget-product-page-cascade.css`, `bundle-widget-product-page-cognive.css`, `bundle-widget-product-page-modal.css` |

`apps/OnlyBundles-app/scripts/minify-assets.js` validates every generated CSS asset against Shopify's limit.

### Selector minification gotcha

Do not write a descendant selector as `.parent :is(.child-a, .child-b)` in storefront source CSS. The current minifier can remove the descendant combinator and emit `.parent:is(...)`, which changes the selector to target one element matching both sides. Use explicit descendant selectors, or a combinator such as `.parent > :is(...)` when direct-child semantics are correct. Compound selectors such as `.parent:is(.variant-a, .variant-b)` are safe when they intentionally target the same element.

## Linting

Before every commit, lint modified files:
```bash
npx eslint --max-warnings 9999 <file1> <file2>
```

`--max-warnings 9999` prevents pre-existing warnings (~6500 project-wide) from blocking the check. Fix new **errors** you introduced; leave pre-existing warnings alone.

## Pre-Commit Hook

Tracked hooks live in `.githooks/`. Install them with:

```bash
npm run hooks:install
```

`npm install` also runs a warning-only `prepare` installer unless `CI=true` or
`WPB_SKIP_HOOK_INSTALL=1` is set.

The pre-commit hook is staged-file aware. It blocks commits for critical
breakage: staged diff whitespace errors, partially staged checked source files,
ESLint errors on staged source, raw JS syntax errors, banned styling unit-test
patterns, related Jest failures, and stale generated widget/CSS assets when
their source files are staged. It also attempts `npm run graphify:rebuild` and
auto-stages `graphify-out/GRAPH_REPORT.md` plus `graphify-out/graph.json` when
the rebuild succeeds. Local graphify runtime/configuration failures warn only so
developer-specific Python or uv setup does not block unrelated commits.

Graphify's official `post-commit` and `post-checkout` hooks share the tracked
`.githooks/` path with Wolfpack's pre-commit hook. Run `graphify hook install`
after installing or upgrading the uv tool; this also registers the `graphify`
merge driver used by `.gitattributes`. Verify all three with
`graphify hook status`, `git config --get core.hooksPath`, and
`git config --get merge.graphify.driver`.

## Graphify Knowledge Graph

After modifying code files:
```bash
npm run graphify:rebuild
```

The npm wrapper invokes the installed public CLI as `graphify update . --force`.
Do not import underscore-prefixed Graphify Python functions or depend on the
system Python: Graphify's uv tool environment owns the executable and its
dependencies. The wrapper keeps Wolfpack-owned pre/post sanitization for invalid
legacy file types, excluded generated sources, and duplicate hyperedge IDs.

`graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` are tracked.
`graphify-out/.graphify_python`, caches, manifests, lock/temp files, dated
protected-output backups, `graph.html`, and `GRAPH_TREE.html` are generated
support artifacts and should stay ignored. Current Graphify versions emit an
aggregated `graph.html` for graphs above 5,000 nodes; `graphify tree` remains a
useful filesystem-oriented fallback.

Keep `graphify-out/` in `.graphifyignore`. Graphify uses `.graphifyignore`
instead of `.gitignore` when present, so the file must also list normal
dependency/build directories such as `node_modules/`, `.git/`, and build
outputs. Do not let graphify ingest its own `GRAPH_REPORT.md` or backup
folders as source input.

Also keep local agent/editor state out of graphify input: `.claude/`,
`.codex/`, and `.vscode/`. The entire generated `Wolfpack: Product Bundles/`
wiki must be excluded, not only its Obsidian state; otherwise Graphify ingests
its own generated pages and recursively degrades community and query signal.

If ignored, deleted, or generated files were previously scanned, use the
wrapper's forced public update. It explicitly prunes known generated-source
nodes before and after Graphify updates the remaining corpus.

If a rebuild warns about invalid `file_type: "concept"` nodes, those are stale
semantic nodes preserved from an older graphify schema. Normalize them to
`document` before rebuilding so validation is clean.
