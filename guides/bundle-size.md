# Bundle Size

[Getting started](../README.md) · [Formatting](formatting.md) · [Parsing](parsing.md) · [Diagnostics](diagnostics.md) · [Custom codecs](codecs.md) · [Bundle size](bundle-size.md)

These measurements estimate the JavaScript added to a project after bundling, tree shaking, and minification of `@neutrium/formatter` and its runtime dependencies.

Use the first two size columns if your application does not already bundle `@neutrium/decimal`. If it already uses the full `Decimal` constructor from `@neutrium/decimal`, use the last two columns to estimate the additional cost of formatter. Adding both default formatting and parsing shares their common implementation; do not add the separate rows together.

## Measured sizes

<!-- bundle-sizes:start -->

Measured for **@neutrium/formatter 1.0.0**, with **@neutrium/decimal 2.2.0** and **Rolldown 1.2.7**. Sizes are KiB (1 KiB = 1,024 bytes).

| Functionality included | Minified, including Decimal | Gzipped, including Decimal | Added minified, Decimal already bundled | Added gzipped, Decimal already bundled |
| --- | ---: | ---: | ---: | ---: |
| Default formatter (all built-ins) | 73.02 KiB | 24.36 KiB | 45.49 KiB | 14.31 KiB |
| Default parser (all built-ins) | 70.69 KiB | 23.94 KiB | 43.16 KiB | 13.97 KiB |
| Default formatting + parsing | 82.33 KiB | 27.35 KiB | 54.81 KiB | 17.29 KiB |
| Only number formatting | 61.82 KiB | 20.97 KiB | 34.28 KiB | 10.99 KiB |
| Only currency formatting | 61.82 KiB | 20.97 KiB | 34.28 KiB | 10.99 KiB |
| Only unit formatting | 61.82 KiB | 20.97 KiB | 34.28 KiB | 10.99 KiB |
| Only bytes formatting | 52.04 KiB | 17.93 KiB | 24.49 KiB | 7.91 KiB |
| Only percentage formatting | 51.07 KiB | 17.53 KiB | 23.52 KiB | 7.51 KiB |
| Only ordinal formatting | 52.45 KiB | 18.04 KiB | 24.90 KiB | 8.01 KiB |
| Only duration formatting | 44.55 KiB | 15.62 KiB | 17.00 KiB | 5.63 KiB |
| Only number parsing | 62.71 KiB | 21.31 KiB | 35.16 KiB | 11.35 KiB |
| Only bytes parsing | 51.71 KiB | 17.90 KiB | 24.16 KiB | 7.93 KiB |
| Only elapsed-duration parsing | 37.20 KiB | 13.29 KiB | 9.63 KiB | 3.36 KiB |

The "already bundled" columns above use the full `Decimal` constructor from `@neutrium/decimal`. Its baseline is 43.48 KiB minified / 15.99 KiB gzipped.

### If you use a different Decimal tier

This table shows the cost of adding the **default formatter** to each existing Decimal tier. All scenario/tier combinations, exact byte counts, combined totals, and entry sources are also recorded in `dist/bundle-sizes.json`.

| Existing Decimal import | Existing minified | Existing gzipped | Formatter adds, minified | Formatter adds, gzipped |
| --- | ---: | ---: | ---: | ---: |
| `@neutrium/decimal` | 43.48 KiB | 15.99 KiB | 45.49 KiB | 14.31 KiB |
| `@neutrium/decimal/core` | 16.27 KiB | 6.04 KiB | 56.74 KiB | 18.19 KiB |
| `@neutrium/decimal/arithmetic` | 27.55 KiB | 10.11 KiB | 45.45 KiB | 14.09 KiB |
| `@neutrium/decimal/scientific` | 43.48 KiB | 15.99 KiB | 45.49 KiB | 14.31 KiB |

<!-- bundle-sizes:end -->

## Choose the imports for your application

The default `formatter` and `parser` include all their built-in domains. Using only `{ kind: "bytes" }` with the default formatter does not remove the other registered codecs. For a smaller bundle, construct a registry with only the codecs you need:

```ts
import { Formatter, bytesCodec } from "@neutrium/formatter/extensions";

const sizes = new Formatter({ codecs: [bytesCodec] });
sizes.format(1536, { kind: "bytes" }); // "1.5 KiB"
```

Use selective imports from `/extensions` and `/extensions/parse` when you need only a few domains.

Parsing is optional. If your project only displays values, omit the parsing import. To accept only byte-size input:

```ts
import { Parser, bytesParser } from "@neutrium/formatter/extensions/parse";

const input = new Parser({ codecs: [bytesParser] });
input.parse("1.5 KiB", { kind: "bytes" }); // "1536"
```

Number, currency, and unit codecs share an implementation, including compact notation. Their individual sizes are therefore similar. Selective bytes, percentage, and ordinal codecs remove that native-domain implementation and its compact locale data. The duration formatter includes both elapsed and localized presentations; the duration parser includes elapsed parsing only. The table measures retained codec functionality, not a promise that a single method or specification can be isolated further.

These are runtime imports. Type-only imports add no JavaScript. Import `runtimeCapabilities()` from `/diagnostics` only if you need its full feature report; it is not included in these formatting/parsing scenarios.

## How the figures are measured

- The fixtures import the built package through its public exports and keep exported formatting/parsing functions callable with dynamic inputs. This prevents the bundler from reducing an example to a precomputed string.
- Rolldown (the version locked with this project's Vite dependency) produces one browser ESM chunk, targeting ES2020, with tree shaking and minification enabled. No dependencies are externalized and no source maps are included.
- Minified size is the UTF-8 byte count of that chunk. Gzipped size uses gzip level 9. KiB values are rounded to two decimal places; `dist/bundle-sizes.json` contains exact byte counts, the tested entry sources, dependency/bundler versions, and combined totals.
- Native Intl implementations and locale data belong to the runtime and are excluded. Bundled library locale rules are included; application code, UI frameworks, and separately installed Intl polyfills are excluded.

Treat these as comparable reference fixtures, not an exact prediction for an existing application. Its other imports, bundler, compression settings, shared chunks, and dependency versions affect the final output. Gzip deltas also reflect compression shared with the baseline and are not the size of a separately downloadable formatter file.

## Refresh the measurements

The normal build refreshes the marked section above, hand-written explanations remain intact, using the following commands:

```sh
pnpm run build         # Compile, measure, update this guide and dist/bundle-sizes.json
pnpm run sizes:built   # Refresh from an already current dist build
pnpm run sizes:check   # Re-measure without writing; fail if the guide or JSON is stale
```

After a source or dependency change, run the build and commit the generated guide with the change so the repository and GitHub Pages show the same measurements. `dist/` is generated and ignored.