# Parsing localized input

[Getting started](../README.md) · [Formatting](formatting.md) · [Parsing](parsing.md) · [Diagnostics](diagnostics.md) · [Custom codecs](codecs.md) · [Bundle size](bundle-size.md)

Import parsing from `@neutrium/formatter/parse`. Use the shared `parser` for `en-US`, or `createParser({ locale })` for another default locale. Formatting and parsing are configured independently and use the same domain specification types.

## Parse one value

```ts
import { parser } from "@neutrium/formatter/parse";

parser.parse("$1,234.50", { kind: "currency", currency: "USD" }); // "1234.5"
parser.parse("12.5%", { kind: "percentage", maximumFractionDigits: 1 }); // "0.125"
parser.parse("1.5 KiB", { kind: "bytes" }); // "1536"
```

Built-in parsers return canonical strings, including for currencies and durations. They do not return JavaScript numbers. This preserves exact digits and removes presentation padding: `"$12.00"` becomes `"12"`. Keep that string for exact calculations, or pass it to a Decimal constructor. Converting it with `Number()` can lose precision.

| Domain | Required specification fields | Parsed result |
| --- | --- | --- |
| Number | `kind: "number"` | Exact numeric string; scientific and compact scales are reversed |
| Currency | `kind: "currency"`, `currency` | Exact amount in the specified currency |
| Percentage | `kind: "percentage"` | Ratio after reversing `percentageScale` (default `100`) |
| Measurement unit | `kind: "unit"`, `unit` | Exact value in that unit; no conversion between units |
| Bytes | `kind: "bytes"` | Byte count after reversing the SI or IEC suffix |
| Ordinal | `kind: "ordinal"` | Numeric string after validating the ordinal pattern |
| Elapsed duration | `kind: "duration"`, `presentation: "elapsed"` | Seconds, or milliseconds with `inputUnit: "milliseconds"` |
| Localized duration | `kind: "duration"`, `presentation: "localized"` | Unsupported |

There is no parser for range text or a complete column. Parse each editable value separately. Custom parsers may return other types; see [custom codecs](codecs.md).

## Match the display specification

Use the same locale, precision, signs, and overrides for rendering and parsing. A compiled formatter's `.spec` preserves those settings, including its effective locale. Reuse it to keep a form's input and display consistent:

```ts
import { createFormatter } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";

const euros = createFormatter({ locale: "de-DE" }).compile({ kind: "currency", currency: "EUR" });
const amountInput = parser.compile(euros.spec);

const text = euros.format("1234.5"); // "1.234,50 €"
amountInput.parse(text);              // "1234.5", using the compiled German locale
```

For uncompiled specifications, supply `locale` explicitly or configure both instances with the same default locale. Custom codecs that need application context must receive that context on both instances; `.spec` carries presentation options, not application context.

Parsing recovers only the precision represented by the text. Formatting `"1.239"` to two fraction digits and parsing `"1.24"` returns `"1.24"`, not the original input. Sign suppression can also remove information. Retain original domain values separately when the application needs them.

## Handle invalid input

Built-in parsing validates the whole presentation rather than scanning for a number. Grouping, signs, affixes, and precision must agree with the specification. In `en-US`, `"1,234.5"` is valid number text but `"12,34.5"` is not. A currency parser rejects a mismatched currency label.

```ts
import { parser } from "@neutrium/formatter/parse";

function validateAmount(text: string): { value: string } | { error: string }
{
    try
    {
        const value = parser.parse(text, { kind: "currency", currency: "USD" });

        if (!Number.isFinite(Number(value)))
        {
            return { error: "Enter a finite amount." };
        }

        return { value };
    }
    catch
    {
        return { error: "Enter a US dollar amount, for example $1,234.50." };
    }
}

validateAmount("$12.50"); // { value: "12.5" }
validateAmount("€12.50"); // { error: ... }
```

Parsing checks presentation syntax. Your form still needs domain rules, such as requiring a finite value or disallowing negative quantities. The example uses `Number()` only to check finiteness; it returns the original exact string. Keep library error details for diagnostics and give users a message appropriate to the field.

Exact presentation matches are attempted first. Surrounding whitespace is tolerated afterward, but internal whitespace and grouping remain significant. `zeroDisplay` is recognized as `"0"` before ordinary numeric syntax, so avoid a placeholder that could also represent a nonzero value. Normal zero text remains parseable alongside the placeholder.

Use `supports()` to validate a specification, not an input string. `parse()` still needs error handling for user-entered text, even when `supports()` returns true.

## Reuse a parser

```ts
import { createParser } from "@neutrium/formatter/parse";

const german = createParser({ locale: "de-DE" });
const numbers = german.compile({ kind: "number", maximumFractionDigits: 2 });

["1.234,5", "20,25"].map(numbers.parse); // ["1234.5", "20.25"]
```

Compilation validates the specification once, deeply copies and freezes it, and returns a bound `parse` callback. Later edits to the original specification do not affect it. Unsupported specifications throw during compilation; a successful compiled parser always has a required `parse` method. Compiled parsers do not expose formatting, `supports`, or `resolve` methods; inspect their cached `.resolution` or use the original instance.

## Parse shared compact scales

For text displayed at a shared compact scale, compile the series first and give its effective specification to the parser:

```ts
import { formatter } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";

const thousands = formatter.compileSeries([900, 1200], {
    kind: "number", notation: "compact", maximumFractionDigits: 1,
});
const input = parser.compile(thousands.spec);

thousands.format(900);         // "0.9K"
input.parse("0.9K");           // "900"
thousands.format(2_000_000);   // "2,000K" — the selected scale stays fixed
```

The original automatic specification would normally display `900` without a compact suffix. Its strict parser may therefore reject shared-scale `"0.9K"`. The effective `.spec` carries the fixed `compactExponent` needed to accept it. An explicit `compactExponent` works as well. Byte suffixes carry their own scale and are parseable without this extra step.

## Check unsupported presentations

```ts
import { parser } from "@neutrium/formatter/parse";

const spec = { kind: "duration", presentation: "localized" } as const;
parser.supports(spec); // false

const result = parser.resolve(spec);

if (!result.supported)
{
    console.error(`This display cannot be used as an editable duration: ${result.error.message}`);
}
```

For TypeScript support inspection, assign domain options to a specification variable before passing it to `Parser.supports` or `Parser.resolve`; those methods accept the common specification shape. `parse` and `compile` infer the complete domain-specific shape directly.

Localized durations cannot be parsed, even when `Intl.DurationFormat` is available. Use an elapsed duration for reversible scalar text:

```ts
import { parser } from "@neutrium/formatter/parse";

parser.parse("1:01:01", {
    kind: "duration", presentation: "elapsed", inputUnit: "milliseconds",
}); // "3661000"
```

See [diagnostics and compatibility](diagnostics.md) for runtime feature checks and error handling across both APIs.
