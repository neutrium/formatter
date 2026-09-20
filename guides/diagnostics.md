# Diagnostics and Compatibility

[Getting started](../README.md) · [Formatting](formatting.md) · [Parsing](parsing.md) · [Diagnostics](diagnostics.md) · [Custom codecs](codecs.md) · [Bundle size](bundle-size.md)

Underlying `Intl` support can be assessed using `supports(spec)` for a yes/no decision and `resolve(spec)` when you need capabilities or a failure reason.

Formatting and parsing report capabilities independently. `formatter.resolve(spec).capabilities.parse` is always false. Use `parser.supports(spec)` or `parser.resolve(spec)` from `@neutrium/formatter/parse` to check parsing; its rendering capabilities are always false. For example, localized durations are supported by the formatter but unsupported by the parser.

## Specification support

Use `supports()` when you can choose an alternative presentation. For example, a duration label can use localized words where available and elapsed time elsewhere:

```ts
import { formatter } from "@neutrium/formatter";

function durationLabel(seconds: number): string
{
    const localized = { kind: "duration", presentation: "localized", style: "long" } as const;

    if (formatter.supports(localized))
    {
        return formatter.format(seconds, localized);
    }

    return formatter.format(seconds, { kind: "duration", presentation: "elapsed" });
}

durationLabel(3661); // "1 hour, 1 minute, 1 second", or "1:01:01" without Intl.DurationFormat
```

Use `resolve()` when you need to explain a rejected configuration or the defaults that will be applied. Currency precision, for example, varies by currency:

```ts
import { formatter } from "@neutrium/formatter";

function currencyPrecisionHelp(currency: string): string
{
    const result = formatter.resolve({ kind: "currency", currency });

    if (!result.supported)
    {
        return `Currency display unavailable: ${result.error.message}`;
	}

    const digits = result.intl?.resolvedOptions.maximumFractionDigits;

    return digits === undefined ? "Precision is automatic." : `Amounts display up to ${digits} decimal places.`;
}

currencyPrecisionHelp("USD"); // "Amounts display up to 2 decimal places."
currencyPrecisionHelp("JPY"); // "Amounts display up to 0 decimal places."
```

To offer range display for a dynamically selected codec, check `resolution.capabilities.range`. `rangeImplementation` explains how supported ranges are rendered: `native`, `conditional`, `fallback`, or `custom`. `conditional` means some values need the wrapper fallback, such as parenthesized negatives. It does not mean the range is unavailable.

`resolve()` returns a discriminated `ResolvedFormat` union. Check `resolution.supported` before reading success-only fields. `compile()` throws the original validation error and returns a reusable formatter on success; `compiled.resolution` is always successful.

Built-in numeric specifications are checked at runtime as well as by TypeScript. Unknown or wrong-domain keys, invalid wrapper options, and incorrect value types are rejected rather than ignored or coerced. Optional fields may be `undefined`; an unknown key is still rejected even when its value is `undefined`.

```ts
formatter.supports({ kind: "number", maximumFractonDigits: 2 }); // false: misspelled key
formatter.supports({ kind: "bytes", base: 1000 });              // false: use byteBase
formatter.supports({ kind: "bytes", byteBase: 999 });           // false: use 1000 or 1024
formatter.supports({ kind: "bytes", byteBase: 1000 });          // true
```

Support checks do not render or validate a domain value. A supported specification can still reject an invalid value when you call `format` or `parse`. Compile valid specifications to reuse their prepared options; ordinary calls observe later edits to caller-owned specifications.

## Handle errors

Use `resolve()` to explain an unavailable presentation without catching an exception. Direct operations and compilation throw the original error. For user-entered text, catch parsing failures at the input boundary and show an application-appropriate validation message; see the [parsing guide](parsing.md#handle-invalid-input).

| Error | Meaning | Next step |
| --- | --- | --- |
| `UnknownFormatError` | The selected registry has no codec for the requested `kind` | Use a factory with built-ins, or register the required codec |
| `DuplicateFormatError` | A codec kind is registered twice | Use a new kind, or construct an isolated registry with exactly the desired codecs |
| `UnsupportedParseError` | The chosen presentation cannot be parsed | Use a parseable presentation, such as an elapsed duration |
| `UnsupportedRangeError` | The selected format has no range operation | Check `resolution.capabilities.range` before offering a range |
| `UnsupportedOrdinalLocaleError` | No ordinal patterns are available for the language | Supply `ordinalPatterns` or choose `ordinalFallback: "number"` |
| `TypeError` or `RangeError` | Invalid input/options or a missing runtime feature | Inspect the message, validate inputs, and check the specification with `resolve()` |

The named errors are available from the root entry. The `/parse` entry also exports `UnknownFormatError`, `DuplicateFormatError`, and `UnsupportedParseError`. `UnsupportedOrdinalLocaleError` extends `RangeError`; the other named errors extend `Error`. Custom codecs may throw their own errors.

```ts
import { formatter } from "@neutrium/formatter";

const result = formatter.resolve({ kind: "bytes", byteBase: 999 });

if (!result.supported)
{
  console.error(`${result.error.name}: ${result.error.message}`); // use byteBase 1000 or 1024
}
```

## Runtime diagnostics

`runtimeCapabilities()` from `@neutrium/formatter/diagnostics` returns one immutable, cached snapshot of the Intl features relevant to the package. It detects behavior rather than relying on browser or Node.js version strings:

```ts
import { runtimeCapabilities } from "@neutrium/formatter/diagnostics";

const runtime = runtimeCapabilities();

console.log(JSON.stringify({ intl: runtime }, null, 2));
// Attach this feature report to a support request when output differs between environments.
```

Use this report to diagnose differences between environments. For example, `exactDecimalStrings: false` explains why numeric formatting is unavailable, while `durationFormat: false` affects localized durations. To decide whether a specific presentation will work, use `supports(spec)` or `resolve(spec)`; a broad feature flag does not validate all its options or locale data.

## Compatibility

- **Node.js:** 24.0.0 or newer with full ICU locale data. CI tests the minimum version 24.0.0 and the latest Node 24.x and 26.x releases, including installation of the packed package in an independent consumer project.
- **TypeScript:** 5.4 or newer. Public types use [`NoInfer`, introduced in TypeScript 5.4](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html). Packed-package type tests run with 5.4.5 and the development compiler, using both `NodeNext` and `Bundler` module resolution with declaration checking enabled.
- **Browsers:** ES2020 modules and BigInt, plus modern Intl implementations with exact decimal-string support in both `Intl.NumberFormat.format` and `formatToParts`. CI runs smoke tests in the Chromium, Firefox, and WebKit builds pinned by the Playwright lockfile; it logs their versions. This is an engine test baseline, not a guarantee for older branded browser releases. [Playwright's browser documentation](https://playwright.dev/docs/browsers) explains how these builds relate to browser releases.

Install any Intl polyfills **before importing this package or querying capabilities**; runtime capability results are cached.

Localized durations require native or polyfilled `Intl.DurationFormat`; there is no library fallback. Without it, `supports(spec)` returns `false`, `resolve(spec)` reports the missing service, and localized formatting and compilation throw `RangeError`. Elapsed duration formatting and parsing do not require that service. Number ranges retain their wrapper fallback. Use `resolve(spec)` to check support for requested rounding and presentation options. The browser tests cover exact values, localized parsing, ranges, the prerelease regressions, and duration behavior with and without `Intl.DurationFormat`; they do not claim exhaustive locale coverage.

Duration implementations can differ on mixed textual/numeric units. For example, English `{ minutes: 1 }` with `style: "long"` and `seconds: "numeric"` renders as `"1 minute:0"` on some runtimes and `"1 minute, 0"` on others. Localized formatting follows the installed `Intl.DurationFormat` implementation.
