# @neutrium/formatter

Humanise numbers - Intl-first exact formatting and strict parsing for numbers, currencies, percentages, units, bytes and durations.

Display prices, measurements, file sizes, and durations in your users' locale. Parse their formatted input back into exact values, and keep table or chart labels on a consistent scale.

This library wraps and extends the native javascript localisation framework [`Intl`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl) and provides processing of numbers to the following formats: number strings, ordinals, percentages, bytes, durations, currencies, and units.

If you only need one-way number, currency, or unit rendering, `Intl.NumberFormat` may be sufficient. However, this library adds strict inverse parsing, exact scaling, shared series presentation, and a consistent API across domains.

[Interactive demo](https://neutrium.github.io/formatter/demo/) · [API reference](https://neutrium.github.io/formatter/)

## Install

```sh
pnpm add @neutrium/formatter
```

This library is ESM-only and requires Node.js 24+ with full ICU data, or a modern browser with Intl support. TypeScript 5.4+ is supported. See [compatibility requirements](guides/diagnostics.md#compatibility) for the tested environments and polyfill ordering.

## Quick start

```ts
import { formatter } from "@neutrium/formatter";

const str = formatter.format("1234.5", { kind: "currency", currency: "USD" });

console.log(str);         // "$1,234.50"

```

The shared instance defaults to the `en-US` locale. Create an independent instance for another default locale:

```ts
import { createFormatter } from "@neutrium/formatter";

const german = createFormatter({ locale: "de-DE" });
const str = german.format("1234.5", { kind: "number" });

console.log(str);      // "1.234,5"
```

## Formats

Below is an introduction for the various types of formatting options available in `@neutrium/formatter`. See the [formatting guide](guides/formatting.md), [interactive demo](https://neutrium.github.io/formatter/demo/) and [API reference](https://neutrium.github.io/formatter/) for further guidance and examples of using this library.

### General Numbers

Numeric specifications use `kind: "number"` for general localized numbers. Inputs may be numbers, decimal strings, bigint values, or compatible decimal objects; use strings or [@neutrium/decimal](https://github.com/neutrium/decimal) when the digits must remain exact:

```ts
import { formatter } from "@neutrium/formatter";

const str = formatter.format("9007199254740993.25", {
  kind: "number",
  maximumFractionDigits: 2,
});

console.log(str);         // "9,007,199,254,740,993.25"
```

### Ordinals

Ordinal formatting applies locale-specific rules to numbers that describe an order, such as a position in a list:

```ts
const str = formatter.format(23, { kind: "ordinal" });

console.log(str);        // "23rd"
```

You can provide a custom pattern for a locale, using `{number}` where the formatted number belongs:

```ts
formatter.format(42, {
  kind: "ordinal",
  ordinalPatterns: { other: "No. {number}" },
});
// "No. 42"
```

### Currencies

```ts
import { formatter } from "@neutrium/formatter";

const str = formatter.format("1234.5", { kind: "currency", currency: "USD" });

console.log(str);         // "$1,234.50"
```

### Compact Notation

Use compact notation for abbreviated magnitudes. The locale selects the label and plural form, while `compactExponent` can fix a shared scale:

```ts
let str = formatter.format(1536, {
    kind: "number",
    notation: "compact",
    maximumFractionDigits: 1,
});

console.log(str);        // "1.5K"

str = formatter.format(1_250_000, {
    kind: "number",
    notation: "compact",
    compactExponent: 6,
    maximumFractionDigits: 1,
});

console.log(str);       // "1.3M"
```

### Percentages

The percentage formatter applies the configured power-of-ten scale before rendering the percent sign:

```ts
const str = formatter.format(0.125, {
  kind: "percentage",
  maximumFractionDigits: 1,
});

console.log(str)         // "12.5%"

```

### Durations

Every duration specification requires an explicit presentation:

```ts
import { formatter } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";

let str = formatter.format(3661, { kind: "duration", presentation: "elapsed" });

console.log(str);                // "1:01:01"

str = formatter.format(
  { hours: 1, minutes: 1, seconds: 1 },
  { kind: "duration", presentation: "localized", style: "long" },
);

console.log(str)                // "1 hour, 1 minute, 1 second" — format-only
```

### Bytes

Bytes default to IEC base 1024; select base 1000 for SI units:

```ts
const str = formatter.format(1536, { kind: "bytes" });

console.log(str);        // "1.5 KiB"
```

## Collections and ranges

You can format an array of values either as formatted values or common length formatted values for rendering in a table:

```ts
import { formatter } from "@neutrium/formatter";

formatter.formatSeries([1200, 1500, 900], {
    kind: "number",
    notation: "compact",
    maximumFractionDigits: 1,
});
// ["1.2K", "1.5K", "0.9K"] — one shared scale

formatter.formatColumn([1.2, 12, 123.45], {
    kind: "number",
    maximumFractionDigits: 2,
});
// ["  1.2 ", " 12   ", "123.45"]
```

Series use shared compact/byte scales by default. Pass `{ scale: "individual" }` as the third argument for independent scales. Use `formatRange(start, end, spec)` for localized ranges.

Use `formatter.compileSeries(values, spec)` to select a scale once and reuse it for later batches or scalar formatting; pass its `.spec` to `parser.compile()` for strict parsing. The returned compiled formatter exposes the selected scale in its frozen `.spec`.

See [series and columns](guides/formatting.md#series-and-columns) for scale and parsing caveats, and [ranges](guides/formatting.md#ranges) for supported domains.

## Reusing Specifications

Compile a specification to improve performance when repeatedly rendering the same specification:

```ts
import { formatter, type CurrencyFormatSpec } from "@neutrium/formatter";

const moneySpec = {
  kind: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
} satisfies CurrencyFormatSpec;

const money = formatter.compile(moneySpec);
["12.25", "20"].map(money.format); // ["$12.25", "$20.00"]
```

Compilation validates the options and freezes a copy, so later edits to `moneySpec` do not change `money`. Its methods work as callbacks. See [compiled formatters](guides/formatting.md#compiled-formatters) for pairing one with a parser.

## Custom Codecs

Add a custom codec when your application has a value domain or rendering rules that the built-in formats do not cover. Register formatting codecs with `createFormatter`; parsing codecs use the separate `createParser` entry point:

```ts
import { createFormatter } from "@neutrium/formatter";
import type { FormatCodec, FormatSpecBase } from "@neutrium/formatter/extensions";

interface Point { x: number; y: number }
interface PointSpec extends FormatSpecBase { kind: "point"; separator?: string }

const pointCodec = {
    kind: "point",
    format(point, spec)
    {
        return [{ type: "literal", value: `${point.x}${spec.separator ?? ","}${point.y}` }];
    },
} satisfies FormatCodec<"point", Point, PointSpec>;

const custom = createFormatter({ codecs: [pointCodec] });
custom.format({ x: 10, y: 20 }, { kind: "point" });
```

Custom codecs can define their own specification and value types while keeping the built-in codecs available. See the [custom codecs guide](guides/codecs.md) for complete formatting and parsing examples, validation, compiled codecs, and bundle-size guidance.

## Parsing Formatted Numbers

This package also provides formatted number parsing capability using an optional import:

```ts
import { parser, createParser } from "@neutrium/formatter/parse";

const money = parser.compile({ kind: "currency", currency: "USD" });
money.parse("$12.25"); // "12.25"

const german = createParser({ locale: "de-DE" });
german.parse("1.234,5", { kind: "number" }); // "1234.5"
```

You can pass a compiled formatter's `.spec` to `parser.compile()` to preserve its locale and selected scale.

Use decimal strings or bigint when a JavaScript number cannot represent a value exactly. Objects with `toValue(): string`, including `@neutrium/decimal` instances, are also accepted.

See the [parsing guide](guides/parsing.md) for input validation, matching locales, and parsing scaled values.

## Where to go next

- [Interactive demo](https://neutrium.github.io/formatter/demo/): a demonstration of how to use this library and exploration of formatting specifications.
- [API reference](https://neutrium.github.io/formatter/): full detail of the library api including accepted parameters and return types.
- [Formatting guide](guides/formatting.md): precision, locales, currencies, units, compact scales, bytes, ordinals, durations, and overrides.
- [Parsing guide](guides/parsing.md): accept localized input, handle errors, reuse parsers, and recover exact scaled values.
- [Diagnostics and compatibility](guides/diagnostics.md): `supports()` vs `resolve()`, runtime capabilities, and deployment requirements.
- [Custom codecs](guides/codecs.md): extending the library, isolated registries, custom parse types, and advanced contracts.
- [Development and migration](guides/development.md): tests, benchmarks, documentation builds, releases, and pre-release API changes.
- [Bundle size guide](guides/bundle-size.md#measured-sizes): compares minified and gzipped sizes for the default formatter/parser and individual codecs.

## License

This project is licensed under the MIT License, see the [LICENSE](./LICENSE) file for details.

You are free to:

- Use this plugin for personal or commercial purposes
- Modify and distribute the code
- Include it in other projects

Under the following conditions:

- You must include the original license and copyright notice

### Disclaimer

This plugin is provided "as is", without warranty of any kind. Use at your own risk.
