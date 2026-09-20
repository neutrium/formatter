# Formatting Guide

[Getting started](../README.md) · [Formatting](formatting.md) · [Parsing](parsing.md) · [Diagnostics](diagnostics.md) · [Custom codecs](codecs.md) · [Bundle size](bundle-size.md)

Examples below use the shared `formatter` and `parser` instances unless a configured instance is shown. Import these once when following the guide. Outputs use `en-US` unless another locale is specified; locale data can affect whitespace and wording across runtimes.

```ts
import { formatter, type NumberFormatSpec, type PercentageFormatSpec } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
```

## Exact inputs and parse results

Strict parsing is opt-in: import `{ parser, createParser }` from `@neutrium/formatter/parse`. Formatting imports never load localized parsers. Compiled `.spec` objects include their effective locale; pass them directly to a parser even if its default locale differs. For uncompiled specs, configure matching locales or supply `locale` explicitly. Custom context must still be configured on both instances where needed.

Use exact numeric strings, bigint, numbers, or objects implementing `toValue(): string`, including the [@neutrium/decimal](https://github.com/neutrium/decimal) library:

```ts
import { parser } from "@neutrium/formatter/parse";
import { Decimal } from "@neutrium/decimal";
import { formatter } from "@neutrium/formatter";

formatter.format(new Decimal("9007199254740993.25"), {
    kind: "number",
    maximumFractionDigits: 2,
});
// "9,007,199,254,740,993.25"

new Decimal(parser.parse("$1,234.50", { kind: "currency", currency: "USD" }));
// Decimal("1234.5")

```

Built-in numeric and elapsed-duration parsers return exact canonical strings. Localized durations cannot be parsed. Custom codec parsers return their declared result type, which may be an object. Construct a `Decimal` from that string when a Decimal result is useful downstream.

Any object with a `toValue(): string` method is accepted structurally, including instances from all Decimal tiers. String inputs and `toValue()` results use Decimal's numeric syntax: decimal and scientific notation, digit separators, and binary (`0b`), octal (`0o`), or hexadecimal (`0x`) prefixes. Decimal also supports fractional prefixed values with power-of-two exponents, such as `"0x1.8p-5"`. Surrounding whitespace is ignored. Decimal validates syntax and applies its configured limits; the formatter uses a private configuration unaffected by consumer changes to Decimal.

```ts
formatter.format("0xff", { kind: "number" });  // "255"
formatter.format("0b1010", { kind: "number" }); // "10"
formatter.format("1_000", { kind: "number" }); // "1,000"
```

Invalid numeric syntax and exceeded Decimal limits propagate Decimal's `DecimalError`; errors thrown by `toValue()` also propagate unchanged. There is no separate formatter-specific textual exponent limit.

This input syntax is distinct from localized output parsing: use the parser for strings such as `"1,234.5"`. Under the default number specification, `parser.parse("0xff", ...)` and `parser.parse("1_000", ...)` still reject text that is not valid formatted output.

Exact digits do not imply an unlimited numeric magnitude. Numeric formats normalize values outside the JavaScript number range to signed infinity or signed zero: `"1e400"` behaves like `Infinity`, and `"-1e-400"` behaves like `-0`. Finite, nonzero inputs within that range retain their exact decimal digits. Rounding or scaling can also overflow or underflow; for example, `"1.79e308"` rounded to one significant digit becomes infinity. Compact or byte scaling cannot recover an input that already overflowed. Non-finite inputs do not select an automatic series scale. Durations have separate exact arithmetic and component limits.

## Intl options

Numeric specifications use Intl option names and semantics:

```ts
formatter.format("1.245", {
    kind: "number",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    roundingMode: "halfEven",
});
// "1.24"

formatter.format(12345, {
    kind: "number",
    maximumSignificantDigits: 3,
    signDisplay: "always",
});
// "+12,300"
```

Shared options are:

- `numberingSystem`
- `useGrouping`
- `minimumIntegerDigits`
- `minimumFractionDigits` / `maximumFractionDigits`
- `minimumSignificantDigits` / `maximumSignificantDigits`
- `roundingMode` / `roundingIncrement` / `roundingPriority`
- `trailingZeroDisplay`
- `signDisplay`
- `negativeDisplay: "sign" | "parentheses"`
- `locale`, which overrides the formatter locale for one operation

Unspecified options retain the host Intl defaults. For example, decimal formatting normally has a default maximum of three fraction digits, while percentage formatting normally has a default maximum of zero.

Set both fraction limits when you want a fixed number of decimal places. For increments such as `0.05`, use equal fraction limits and a compatible `roundingIncrement`:

```ts
formatter.format("1.23", {
    kind: "number", minimumFractionDigits: 2, maximumFractionDigits: 2,
    roundingIncrement: 5,
}); // "1.25"
```

Intl rejects incompatible combinations, including increment rounding with significant-digit precision. Use `formatter.resolve(spec)` to inspect the effective defaults or the reason an option combination is invalid.

## Locales and currencies

```ts
import { createParser } from "@neutrium/formatter/parse";
import { createFormatter } from "@neutrium/formatter";

const german = createFormatter({ locale: "de-DE" });

german.format(1234567.89, {
  kind: "number",
  maximumFractionDigits: 2,
});
// "1.234.567,89"

german.format(1234.5, { kind: "currency", currency: "EUR" });
// "1.234,50 €"

createParser({ locale: "de-DE" }).parse("1.234,50 €", { kind: "currency", currency: "EUR" });
// "1234.5"
```

Currency specifications accept an ISO 4217 code and the Intl options `currencyDisplay`, `currencySign`, `notation`, and `compactDisplay`.

```ts
formatter.format(-1234.5, {
  kind: "currency",
  currency: "USD",
  currencySign: "accounting",
});
// "($1,234.50)"
```

## Measurement units

Unit specifications use `Intl.NumberFormat`'s unit presentation directly. Supply a sanctioned simple unit such as `meter`, or a supported compound identifier such as `kilometer-per-hour`:

```ts
formatter.format(12.5, {
  kind: "unit",
  unit: "kilometer-per-hour",
  unitDisplay: "long",
});
// "12.5 kilometers per hour"

parser.parse("12.5 kilometers per hour", {
  kind: "unit",
  unit: "kilometer-per-hour",
  unitDisplay: "long",
});
// "12.5"
```

`unitDisplay` accepts `short`, `narrow`, or `long`. Unit specifications also support notation and compact scales, ranges, semantic parts, shared-scale series, aligned columns, compiled formatters, exact numeric inputs, and the common numeric presentation options. `unitSymbol` replaces the locale-derived unit part while retaining its position and spacing.

This is presentation, not conversion: formatting `1000` with `unit: "meter"` does not convert it to one kilometre. Unsupported identifiers are rejected by Intl.

## Notation and compact scales

```ts
formatter.format(12345, {
    kind: "number",
    notation: "scientific",
    maximumFractionDigits: 2,
});
// "1.23E4"

formatter.format(1200000, {
    kind: "number",
    notation: "compact",
    compactDisplay: "long",
});
// "1.2 million"
```

`compactExponent` applies a fixed decimal scale while retaining the locale's Intl compact patterns. Patterns depend on the rounded coefficient's plural category and integer width, not just the scale: Arabic thousands can display `3 آلاف` but `10 ألف`. Integer padding does not change pattern selection. Coefficients beyond the scale's native range reuse its widest available pattern; the scale never automatically changes. This keeps every value in a table on the same scale:

Fixed-scale plural categories are evaluated from the exact displayed decimal using bundled CLDR 48 cardinal rules, including visible trailing zeros. Intl still supplies rounding and localized affixes. This avoids the precision limit of `Intl.PluralRules.select`, whose input is a JavaScript number; very large integers and very small fractional digits are not converted to a numeric surrogate.

```ts
const millions = {
    kind: "number",
    compactExponent: 6,
    maximumFractionDigits: 2,
} satisfies NumberFormatSpec;

formatter.format(1234567, millions); // "1.23M"
formatter.format(1200, millions);    // "0M" with the configured Intl precision
parser.parse("1.23M", millions); // "1230000"
```

Use an exponent that starts a compact magnitude in the selected locale. Common English scales are 3, 6, 9, and 12; other locales can use different scales.

## Percentages

Percentages use Intl's percent presentation. `percentageScale` can model other power-of-ten units:

```ts
const basisPoints = {
    kind: "percentage",
    percentageScale: 10000,
    percentageSymbol: " bp",
    maximumFractionDigits: 0,
} satisfies PercentageFormatSpec;

formatter.format("0.0125", basisPoints); // "125 bp"
parser.parse("125 bp", basisPoints); // "0.0125"
```

## Bytes

Bytes default to IEC base 1024; select base 1000 for SI units:

```ts
formatter.format(1536, { kind: "bytes" });
// "1.5 KiB"

formatter.format(1500000, { kind: "bytes", byteBase: 1000 });
// "1.5 MB"

formatter.format(512, { kind: "bytes", byteExponent: 1 });
// "0.5 KiB" — explicitly retain one unit
```

`byteExponent` is a unit index from `0` (bytes) to `8` (YB/YiB), not a power-of-two exponent. Detailed scale metadata uses the actual exponent: IEC index `1` reports `{ kind: "binary", exponent: 10 }`. Parsing returns the byte count.

## Ordinals

Ordinal rules are included for common languages and can be supplied per call:

```ts
formatter.format(23, { kind: "ordinal" });
// "23rd"

formatter.format(42, {
  kind: "ordinal",
  ordinalPatterns: { other: "No. {number}" },
});
// "No. 42"
```

Use `supportsOrdinal(locale)` or inspect `supportedOrdinalLocales`, both imported from `@neutrium/formatter/diagnostics`, before offering locale-selectable ordinal output. Unsupported locales throw `UnsupportedOrdinalLocaleError` by default. Opt into a plain-number fallback explicitly when that is appropriate:

```ts
formatter.format(2, {
    kind: "ordinal",
    locale: "ar-EG",
    ordinalFallback: "number",
});
// "٢"
```

## Durations

With `presentation: "elapsed"`, durations use the exact elapsed-seconds `H:MM:SS` presentation, or accept milliseconds when requested:

```ts
formatter.format(3661000, { kind: "duration", presentation: "elapsed", inputUnit: "milliseconds" });
// "1:01:01"

parser.parse("1:01:01", { kind: "duration", presentation: "elapsed", inputUnit: "milliseconds" });
// "3661000"
```

Select `presentation: "localized"` and optionally choose a `long`, `short`, `narrow`, or `digital` style (default `short`). Inputs may be elapsed scalar values or records compatible with `Temporal.Duration` and `Intl.DurationFormat`:

```ts
formatter.format(
    { days: 1, hours: 2, minutes: 30 },
    { kind: "duration", presentation: "localized", style: "long", locale: "fr-FR" },
);
// "1 jour, 2 heures et 30 minutes"

formatter.format(
    { seconds: 1, milliseconds: 500 },
    { kind: "duration", presentation: "localized", style: "digital" },
);
// "0:00:01.5"
```

Duration records support `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds`, `milliseconds`, `microseconds`, and `nanoseconds`. The corresponding component style and `...Display` options, `fractionalDigits`, and `numberingSystem` follow `Intl.DurationFormat`.

Localized scalar inputs retain fractional seconds to nanosecond precision. `fractionalDigits` and `roundingMode` control their exact conversion before Intl presentation.

`negativeDisplay` and `signDisplay` remain wrapper-level presentation controls for both scalar and record durations. Localized presentation requires native or polyfilled `Intl.DurationFormat`; there is no library fallback. If unavailable, `supports()` returns `false`, `resolve()` describes the failure, and localized formatting and compilation throw `RangeError`. Load any polyfill before importing the package. Elapsed `H:MM:SS` formatting and parsing remain available without `Intl.DurationFormat`.

Every duration specification requires an explicit `presentation`. Duration records require `presentation: "localized"`; localized-only options on an elapsed specification are rejected. This keeps a specification's reported implementation and parsing capability independent of the value passed to it.

Localized duration text is deliberately format-only: the Intl platform has no duration parser, and calendar units such as months cannot be reduced to an exact scalar. All compiled formatters omit `parse`; calling `parser.parse()` with a localized duration specification throws `UnsupportedParseError`. The elapsed presentation remains strictly and symmetrically parseable.

## Presentation overrides

Overrides replace specific Intl parts without changing locale placement:

```ts
formatter.format(1234.5, {
    kind: "number",
    groupSeparator: "_",
    decimalSeparator: ",",
});
// "1_234,5"

formatter.format(12, {
    kind: "currency",
    currency: "USD",
    currencySymbol: "US$",
});
// "US$12.00"
```

`zeroDisplay` is a whole-output presentation replacement applied after rounding and scale selection. Exact zero, negative zero, and nonzero values that display as zero all produce the replacement verbatim, without signs, accounting parentheses, currencies, units, or compact suffixes. For example, `0.001` with two fractional digits and `zeroDisplay: "—"` renders `"—"`, not `"0.00"`. An empty replacement is allowed. Detailed results contain one literal token, `roundedValue: "0"`, and no scale.

Parsing recognizes the replacement as zero before applying the ordinary numeric grammar; surrounding whitespace is tolerated. Normal numeric zero presentations remain parseable, including signed zero. Placeholder collisions are not disambiguated: the zero replacement wins. Ranges with `zeroDisplay` format endpoints separately so rounded zeros use the same replacement. Series and columns apply it after selecting their scales and before column padding.

`nanDisplay` and `infinityDisplay` retain their magnitude-only behavior, preserving surrounding Intl signs and affixes.

`negativeDisplay: "parentheses"` applies accounting-style presentation to every numeric domain and durations, not only currencies. It remains symmetric during parsing and follows `signDisplay` for zero and hidden signs.

For localized duration records, `signDisplay: "negative"` and `"exceptZero"` suppress signs when native subsecond truncation produces displayed zero. Nonzero calendar fields and separately displayed components still retain their signs. This does not change Intl's truncation of records or the scalar-only `roundingMode` option.

```ts
const spec = { kind: "percentage", negativeDisplay: "parentheses" } satisfies PercentageFormatSpec;
formatter.format(-0.25, spec); // "(25%)"
parser.parse("(25%)", spec); // "-0.25"
```

## Ranges

`formatter.formatRange()` and `formatter.formatRangeToParts()` use the native Intl range implementation for numbers, currencies, percentages, measurement units, and automatic compact notation. Exact strings and objects implementing `toValue(): string`, including `Decimal`, remain exact.

```ts
formatter.formatRange("9007199254740993", "9007199254740995", { kind: "number" });
// "9,007,199,254,740,993–9,007,199,254,740,995"

```

For a UI that emphasizes the upper price, use the range tokens' `source` instead of splitting the localized string. This browser example retains shared punctuation and currency labels:

```ts
import { formatter } from "@neutrium/formatter";

const label = document.createElement("span");

for (const part of formatter.formatRangeToParts(10, 20, { kind: "currency", currency: "USD" }))
{
    const span = document.createElement(part.source === "endRange" ? "strong" : "span");
    span.textContent = part.value;
    label.append(span);
}

document.body.append(label); // $10.00 – $20.00, with the upper endpoint emphasized.
```

Wrapper domains such as bytes, ordinals, fixed compact scales, and parenthesized negatives format each endpoint and join them with the locale-derived range separator. Duration ranges are not built in; custom codecs may implement their own `formatRange` operation.

## Compiled formatters

`formatter.compile()` validates, snapshots, and deeply freezes a specification. Invalid or unsupported specifications throw during compilation. The result provides bound formatting and parts methods, plus range methods only when the resolved presentation supports them:

Specifications may contain primitive values, plain records, null-prototype records, and ordinary arrays. Nested values are copied and frozen, including symbol-keyed properties and cyclic references. Class instances, dates, maps, sets, functions, and accessor properties are rejected with `TypeError` rather than retained as mutable references. Supply their data as plain records instead.

The compiled `.spec` type is recursively readonly too, including nested records, arrays, and tuples. The original caller-owned specification remains independently mutable.

```ts
const decimal = formatter.compile({
    kind: "number",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

decimal.format("1.2");                           // "1.20"
parser.compile(decimal.spec).parse("1.20");      // "1.2"
decimal.formatRange(1, 2);                       // "1.00–2.00"
decimal.formatToParts(1.2);
decimal.formatSeries([1.2, 2.3]);
decimal.formatColumn([1.2, 12]);
```

Compile a specification once when repeatedly rendering a table, chart, or form. Compiled methods reuse prepared options and are bound, so `[1.2, 2.3].map(decimal.format)` works. Direct instance methods should be called on their instance. Direct calls observe later changes to caller-owned specifications; compiled methods keep their snapshot. A second instance using the same specification still applies its own locale and context defaults.

## Series and columns

`formatter.formatSeries()` applies one specification to many values. For automatic compact notation—including measurement-unit presentation—and bytes, its default `scale: "shared"` selects one magnitude from the largest finite absolute value so every row uses the same scale:

```ts
formatter.formatSeries([1_200, 1_500, 900], {
    kind: "number",
    notation: "compact",
    maximumFractionDigits: 1,
});
// ["1.2K", "1.5K", "0.9K"]

formatter.formatSeries([1024, 1536, 2048], {
    kind: "bytes",
    maximumFractionDigits: 2,
});
// ["1 KiB", "1.5 KiB", "2 KiB"]
```

Use `{ scale: "individual" }` to restore per-value automatic magnitudes. `compactExponent` and `byteExponent` explicitly fix a magnitude and therefore take precedence over series selection. `formatter.formatSeriesToParts()` retains semantic tokens for every row.

To reuse the selected magnitude for strict parsing, editing, or later batches, use `compileSeries(values, spec)`. It returns the same compiled-formatter API as `compile`, with the selected scale encoded in its deeply frozen `.spec`:

```ts
const spec = { kind: "number", notation: "compact", maximumFractionDigits: 1 } satisfies NumberFormatSpec;
const thousands = formatter.compileSeries([900, 1200], spec);

thousands.formatSeries([900, 1200]);                          // ["0.9K", "1.2K"]
parser.compile(thousands.spec).parse("0.9K");                 // "900"
thousands.formatSeries([2_000_000]);                          // ["2,000K"] — still thousands
parser.parse("0.9K", thousands.spec);                         // "900"
```

The input values are used only for scale selection, not retained or formatted during compilation. Ordinary value validation still occurs when formatting. The original specification is unchanged. To select a new scale, call `compileSeries(newValues, originalSpec)` again.

Compact number, currency, and unit presentations bind a locale-specific `compactExponent`; bytes bind `byteExponent`. Empty series, series containing only non-finite values, and values below the first magnitude select the base scale: `notation: "standard"` or `byteExponent: 0`. Shared-scale rounding never promotes an individual row out of that base scale. Existing explicit exponents take precedence, including over subsequent `{ scale: "individual" }` options. Other formats compile without scale changes.

Plain `formatSeries()` returns strings and does not modify the original spec. To parse shared compact output, pass a series-compiled formatter's `.spec` or an explicitly fixed `compactExponent` to a parser. The original automatic specification may reject shared-scale text. Byte suffixes carry their scale directly and remain parseable.

`formatter.formatColumn()` builds on the series operation and pads results using `align: "decimal" | "left" | "right"`. Decimal alignment is the default; `fill` selects one Unicode code point for padding. Alignment measures Unicode code points, not terminal cell widths, so consumers rendering East Asian wide characters or ANSI escape sequences should perform display-specific padding after formatting.

```ts
formatter.formatColumn([1, 20, 300], { kind: "number" }, { align: "right", fill: "." });
// ["..1", ".20", "300"]
```

Empty collections return empty arrays after validating their specification and collection options. Column padding is intended for display; parse individual cell text separately.

## Parts and detailed results

Choose the output your application needs. `format()` returns ready-to-display text. `formatToParts()` lets you style individual components. `formatDetailed()` adds the value represented after rounding, for explanations such as chart tooltips.

### Style a price without splitting its text

Currency placement depends on the locale: a dollar symbol can precede an amount, while a euro symbol can follow it. Splitting on a decimal point or assuming the first character is the currency breaks those presentations. In a browser, render every token in order and style only the ones you care about:

```ts
import { formatter } from "@neutrium/formatter";

function renderPrice(value: string, currency: string, locale: string): HTMLSpanElement
{
    const price = document.createElement("span");
    const parts = formatter.formatToParts(value, { kind: "currency", currency, locale });

    for (const part of parts)
    {
        const span = document.createElement("span");
        span.textContent = part.value;
        if (part.type === "currency")
        {
            span.style.fontSize = "0.8em";
		}

        price.append(span);
  }

  return price;
}

document.body.append(renderPrice("1234.5", "EUR", "de-DE"));
// Displays 1.234,50 € with a smaller currency symbol.
```

This preserves grouping, decimal punctuation, signs, spaces, and bidirectional marks. In React, Vue, or another UI framework, apply the same rule when mapping parts to elements: use `type` to choose styling, and render every `value` in its original position. Use text nodes or the framework's escaped text interpolation.

Other token types include `integer`, `fraction`, `unit`, `ordinal`, and duration components such as `hours`. Use `formatSeriesToParts()` to apply the same rendering to table rows at a shared scale. Range parts additionally identify which endpoint a token belongs to through `source`.

`renderTokens(parts)` is useful when a renderer already has parts and also needs a plain-text version, such as an email or text export. If you need only text, call `format()` directly. Detailed results already provide it as `result.text`.

### Rounded chart labels

A compact label intentionally hides digits. Use `roundedValue` to tell the user what the label represents, and retain the original value for chart geometry, calculations, and editing:

```ts
import { formatter } from "@neutrium/formatter";

const visits = "1234567";
const result = formatter.formatDetailed(visits, {
    kind: "number",
    notation: "compact",
    maximumFractionDigits: 2,
});

const point = {
    value: visits,
    label: result.text,
    tooltip: result.roundedValue === undefined
      ? ""
      : `Label represents ${formatter.format(result.roundedValue, { kind: "number" })} visits`,
};
// {
//   value: "1234567",
//   label: "1.23M",
//   tooltip: "Label represents 1,230,000 visits"
// }
```

Numeric and elapsed-duration formats supply canonical strings as rounded metadata. Localized durations omit `roundedValue`, and custom codecs can omit it or return another type. Formatting does not recover digits or signs already lost in the display.

Compact and byte results can include `scale` when the application needs to explain the selected magnitude. Use `compileSeries()` to keep a magnitude stable across a chart or table; inspecting one value's `scale` does not fix the scale for later values.

For troubleshooting a presentation, `result.resolution` records its effective locale and options. Unsupported specifications throw before a detailed result is returned; use `resolve()` first when you want to [handle unavailable features](diagnostics.md#specification-support).
