# Development

[Getting started](../README.md) · [Formatting](formatting.md) · [Parsing](parsing.md) · [Diagnostics](diagnostics.md) · [Custom codecs](codecs.md) · [Bundle size](bundle-size.md)

## Development

Use Node.js 24 or newer with full ICU locale data. The repository uses pnpm 11, pinned through the `packageManager` field.

```sh
pnpm install
pnpm run verify
pnpm exec playwright install chromium firefox webkit
pnpm run test:browser:built
pnpm run docs
pnpm run demo:dev
```

`pnpm test` builds the ESM package, type-checks the public API examples, and runs the Node.js behaviour and performance-contract tests. `pnpm run test:integration` builds the package and checks bundle boundaries, bundle size, documentation links, and TypeScript JSDoc examples extracted directly from source. Every API example must include its imports and compile independently against the public package exports. `pnpm run docs` regenerates the ignored TypeDoc output and fails on missing documentation, invalid links, or other warnings. `pnpm run demo:dev` starts the local interactive demo, and `pnpm run site` builds the complete deployable site into `docs/`.

`pnpm run verify` builds once, then runs behaviour/type tests, integration checks, and the packed-consumer matrix against that output. Commands ending in `:built` deliberately skip compilation and require a current build; they never infer freshness from the presence of `dist`. Use the ordinary standalone commands when starting from source. Browser checks remain separate because they require installed Playwright engines. `site:built` reuses the package build for documentation and demo bundling; `demo:bundle` performs the demo type check and Vite bundling without rebuilding the package.

Operational runtime checks live in `numeric/shared/runtime-checks.ts`, separate from the full report in `core/runtime-diagnostics.ts`. Numeric preparation checks its already-resolved Intl options; only exact-decimal safety and explicitly requested rounding priority need shared cached probes. The latter cannot be checked by equality because Intl may normalize it. Ordinary formatting/parsing bundles must not retain the full diagnostic report, and ordinary operations must not probe unrelated services. Diagnostics reuse the shared probes without becoming an operational dependency.

`pnpm run test:package` builds, packs and installs the package in a temporary consumer directory, verifies declaration-map sources, runs public API smoke tests, and checks all public type examples with the minimum and development TypeScript versions. It uses `npm pack --ignore-scripts` after the explicit build so packaging does not trigger a second compilation. `test:package:built` (or the runner's `--skip-build` flag) reuses an existing build and first checks that exported files exist. It downloads the package's published dependencies from npm and removes the temporary directory afterward. Source TypeScript files are included in the package so declaration maps resolve correctly in editors.

`pnpm run test:package --runtime-only` performs the same package-content and runtime checks without repeating the TypeScript compatibility matrix. CI uses `test:package:built --runtime-only` after behaviour tests on each supported Node version and runs the full declaration matrix once on Node 24.x.

`pnpm run test:browser` runs named library compatibility cases in Chromium, Firefox and WebKit after building. Failures report both the engine and case, and the runner continues to collect remaining assertion failures. Shared locale and numeric-limit fixtures live in `tests/fixtures/intl-cases.js`. These checks exercise library behaviour rather than demo UI interactions. Install the Playwright browser binaries first; Linux CI uses `pnpm exec playwright install --with-deps chromium firefox webkit` to install system dependencies as well.

Exact fixed-compact cardinal selection uses generated, deduplicated CLDR rules in `src/numeric/native/cardinal-data.ts`. After deliberately updating the `cldr-core` development dependency, run `node tools/cardinal-data.mjs --write`, review the generated data and Unicode license, and run the full tests. `node tools/cardinal-data.mjs --check` verifies reproducibility; unit tests also check the data against the installed CLDR source and its integer/decimal examples. Runtime consumers do not load the CLDR package. The rule evaluator operates on already-rounded decimal text, preserving visible fraction operands; Intl supplies the localized patterns. Bundled CLDR rules have a fixed version, while affix wording follows the runtime's ICU version.

## Authoring

Write API comments for library users: explain accepted inputs, return values, defaults, and relevant failure cases. Give each public operation a complete `@example` with imports and a concrete result. An example should answer why someone would choose the operation: style parts, explain a rounded value, validate an input, or select a supported presentation. Avoid examples that only access fields or rebuild text that is already available. Identify browser examples explicitly and preserve all localized tokens when rendering. Put examples on exported declarations so they appear on public reference pages. Keep application workflows in the user guides and maintenance details here.

Numeric quantities remain Decimal internally, including rounded metadata, parser probe inputs, rounding offsets, cached exact/special values, and reconstructed matches. Domain metadata returns `quantity` plus an optional scale; public detailed results and successful parse results serialize only at their boundary. Elapsed parser verification uses a trusted Decimal rendering path rather than reparsing its own canonical output. Preserve signed zero when serializing; whole-output zero placeholders intentionally resolve to positive zero.

## Maintaining bundle-size documentation

`pnpm run build` compiles the package and then runs `sizes:built`. The generator in `tools/bundle-sizes.mjs` bundles representative consumers through the package's public exports, measures minified and level-9 gzip bytes, and refreshes only the marked section in [the bundle-size guide](bundle-size.md). It also writes exact counts, fixture sources, combined totals, and toolchain versions to `dist/bundle-sizes.json`. Both files are included in packed releases.

The existing-Decimal scenarios compare a baseline exporting a live Decimal constructor with the same bundle plus formatter. Keep those exports alive: unused imports would give misleading zero baselines. Dependencies must be bundled, not externalized. Calculate incremental gzip bytes by subtracting independently measured **whole-bundle** sizes, not by subtracting an unrelated Decimal package-size figure.

After changing source, dependencies, or fixtures, run `pnpm run build` and commit the refreshed guide. Use `pnpm run sizes:built` only when `dist` is already current. `pnpm run sizes:check` re-measures without writes and rejects a stale guide or JSON report; use the same Node/toolchain as the build. Integration tests check reproducibility, execute a measured artifact, and verify that shared Decimal modules appear only once.

No publication-only command is needed: `prepublishOnly` already calls `verify`, whose build refreshes measurements before checks and packaging. Standalone `npm pack`/`pnpm pack` builds through `prepack`. The `:built` verification paths reuse those measurements and do not rebuild. Documentation deployments also use the refreshed guide from their preceding package build.

## Maintaining the tests

- Add regressions to the suite for the affected behaviour, such as parser displays, compact metadata, duration rendering, snapshots, or specification validation. Avoid filenames tied to a review or development milestone.
- Keep explicit expected values and rejected inputs beside the case. Use small helpers for repeated scalar-operation assertions and synchronous Intl call counting; do not derive all expected results from the formatter itself.
- Name table cases or include the input, locale and specification in assertion messages. Preserve distinct input-overflow, post-rounding-overflow, plural-category and parser-history cases.
- Compile once per specification in ordinary correctness matrices and reuse that parser across values. Keep representative cold-import and discovery-budget checks in `parser-initialization.test.js`; do not recreate parsers for every matrix value. Parser-history, context-isolation and mutation tests must still establish their own independent state.
- Use `tests/helpers/intl-probes.js` for synchronous method counters, rendering counters and temporary property overrides. It preserves receivers and restores exact descriptors (including absent own properties) even when assertions throw. Keep instrumentation serial within a file; do not use these helpers across asynchronous work.
- Use `tests/helpers/isolated-process.js` when a test needs fresh module caches or runtime changes before import. It runs from the package root with a timeout and includes child output in failures. A new parser clears context-local state, not module-global caches; cache tests must explicitly establish which cold/warm state they require. Test-specific runtime shims inside isolated processes need no restoration.
- Negative type examples should fail for the restriction named in their comment, with a valid neighbouring call on the same API. Formatter/parser separation belongs in `parser-api.type-test.ts`; do not test parser argument restrictions by calling a nonexistent formatter method.
- Runtime tests remain at `tests/*.test.js`, declaration tests at `tests/*.type-test.ts`, and bundle/documentation checks at `tests/integration/*.test.js`. Run the full relevant checks before changing those discovery patterns.

After building, `node tools/benchmark-formatting.mjs` compares optimized series formatting with the general-purpose token-based codec path. Detailed rendering is shared by all codec registrations and no longer has a separate generic parsing fallback; the benchmark verifies identical results and reports median timings over five warm runs. Set `FORMAT_BENCH_ROWS` to change the default 10,000-row workload; timings are informational, not CI thresholds.

## Automation

- `CI` runs behaviour tests and packed-consumer runtime checks on every push to `main` and every pull request using Node 24.0.0, the latest 24.x, and the latest 26.x. A separate Node 24.x job runs documentation, bundle checks and the full TypeScript declaration matrix. Another job runs Chromium, Firefox and WebKit compatibility tests.
- `Documentation` builds TypeDoc plus the interactive demo and deploys both to GitHub Pages after site-relevant changes reach `main`. Configure the repository's Pages source as **GitHub Actions** before the first deployment.
- `Release` publishes to npm when a GitHub Release is published, after the reusable CI workflow passes its Node matrix, integration and browser jobs for that release. The release tag must be `v` followed by the version in `package.json`. Stable releases use the npm `latest` tag; GitHub prereleases use `next`. Direct `npm publish` also runs the behaviour, integration and packed-consumer checks through `prepublishOnly`.

Each independent CI job builds its own package once; later checks use the `:built` runners. During `npm publish`, `prepublishOnly` runs `verify`, and the subsequent `prepack` hook reuses that verified output. Standalone `npm pack` and `pnpm pack` still run a fresh build. Do not bypass lifecycle scripts when publishing; the consumer-test runner suppresses them only when packing already-built output for verification.

Releases use npm trusted publishing and do not require a long-lived npm token. Before the first release, configure the npm package's GitHub Actions trusted publisher for the `neutrium/formatter` repository, workflow filename `release.yml`, and the `npm publish` action.