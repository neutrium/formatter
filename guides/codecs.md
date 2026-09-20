# Custom Codecs

[Getting started](../README.md) · [Formatting](formatting.md) · [Parsing](parsing.md) · [Diagnostics](diagnostics.md) · [Custom codecs](codecs.md) · [Bundle size](bundle-size.md)

Although `@neutrium/formatter` ships with a number of formatting options, you may want additional formatting or parsing options.

If you only need different separators, currency labels, signs, or a zero placeholder, use the built-in [presentation overrides](formatting.md#presentation-overrides). However, if you want to do more extensive customizations like providing new input domains or rendering rules you can create a custom codec.

Custom codec can be created using `createFormatter` for formatting applications and `createParser` for parsing applications.

```ts
import { createFormatter } from "@neutrium/formatter";
import { createParser } from "@neutrium/formatter/parse";
import { type ParseCodec } from "@neutrium/formatter/extensions/parse";
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

const pointParser = {
    kind: "point",
    parse(input, spec)
    {
        const fields = input.split(spec.separator ?? ",");

        if (
            fields.length !== 2 ||
            fields.some(field => field.trim() === "" || !Number.isFinite(Number(field)))
        ) {
            throw new TypeError("Expected two finite coordinates");
        }

        const [x, y] = fields.map(Number);

        return { x, y };
    },
} satisfies ParseCodec<"point", PointSpec, Point>;

const pointFormatter = createFormatter({ codecs: [pointCodec] });
const pointParser = createParser({ codecs: [pointParser] });
const point = pointParser.parse("10,20", { kind: "point" }); // inferred as Point

pointFormatter.format(point, { kind: "point" }); // "10,20"
pointFormatter.format(1234.5, { kind: "number" }); // "1,234.5" — built-ins remain available

const compiled = pointFormatter.compile({ kind: "point" });
const compiledParser = pointParser.compile(compiled.spec);
compiledParser.parse("10,20"); // { x: 10, y: 20 }, inferred as Point
```

`new Formatter()` and `new Parser()` start empty. Each `withCodec(codec)` returns an independent instance, preserving locale and context. Duplicate kinds throw; registration never mutates existing instances.

Built-in formatting and parsing codecs are frozen and expose readonly methods. To customize one, create a separate object such as `{ ...numberCodec, formatString: customFormat }` and install it in an explicit `new Formatter({ codecs: [customCodec] })` registry (or `Parser` for parsing). Do not add it to the default registry under an existing kind. Keep all overridden hooks consistent: changing `formatString` alone does not change parts or detailed output.

Registration throws `TypeError` for a non-object codec, an empty or non-string kind, a missing or non-callable required method (`format` or `parse`), or a non-callable optional hook. Omit optional hooks or set them to `undefined`; `null` is not supported. Each registry validates its own operation's contract, so one object may implement both formatting and parsing. This checks the codec's shape, not its return values or domain-specific behavior.

## Codec responsibilities

A codec owns specification and value validation. Share validation with its parser where possible and use `resolve` to validate a specification and report support without rendering sample values.

Implement `format` first. Add optional hooks when your application needs their behavior:

| Need                                     | Hook               | Contract                                                                     |
| ---------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| Validate configuration before formatting | `resolve`          | Throw for invalid options; report capabilities for valid ones                |
| Provide a faster text-only path          | `formatString`     | Return exactly the text produced by joining `format` tokens                  |
| Display a range                          | `formatRange`      | Return tokens with endpoint or shared sources                                |
| Coordinate how a collection is displayed | `formatSeries`     | Return one token array per input, respecting shared/individual scale options |
| Reuse a collection's selected scale      | `selectSeriesSpec` | Return same-kind options encoding the scale, without mutating the input      |
| Explain display rounding                 | `formatDetailed`   | Return parts and any recoverable rounded value or scale                      |

For parsing, `parse` is required. Its result type is inferred. `resolve().parse: false` disables a presentation: direct parsing and compilation throw, and `supports` returns false. Successful compiled parsers always have a required `parse` method. Built-in numeric and elapsed-duration parsers return exact strings; custom parsers may return objects.

Implement `selectSeriesSpec(values, spec, context)` to make a custom scale reusable through `formatter.compileSeries()`. Return a specification of the same kind that encodes the selected scale; never mutate the frozen input. Compilation snapshots the result and resolves final capabilities. Without this hook the spec retains its bound locale and other options. Share selection logic with `formatSeries`, and make scalar rendering and parsing honor explicit scales and `spec.locale`. Compilation supplies the instance locale when omitted; returned series options that omit it inherit the initial specification's locale.

## Advanced types

An ordinary application can import specification types from `@neutrium/formatter` and let method results be inferred. The types below are for codec authors and libraries that wrap a registry.

Use `satisfies` to preserve implemented method shapes. Most codecs need no contracts. For specification-dependent input types, rounded metadata or range support, use ordered `ContractCodec<readonly [...]>` entries of `FormatContract<Spec, Value, Rounded, Range>`. The first matching contract wins.

Formatting authoring lives in `@neutrium/formatter/extensions`: `Formatter`, the individual built-in codecs, and types `FormatCodec`, `FormatSpecBase`, `FormatContext`, `CodecFormatResolution`, `ContractCodec`, and `FormatContract`. Generic wrappers can import `FormatterSpec`, `FormatValue`, `RoundedValue`, `CompiledFormat`, `BuiltInCodecs`, and `FormatterOptions`.

Parsing authoring lives in `@neutrium/formatter/extensions/parse`: `Parser`, the individual built-in parsers, and types `ParseCodec`, `ParserOptions`, `ParserSpec`, `ParsedValue`, and `BuiltInParsers`. The ordinary `/parse` entry exports `parser`, `createParser`, `CreateParserOptions`, and `CompiledParser`, plus parsing errors. Shared domain specification types remain root type exports; type-only imports add no runtime dependency.

```ts
import { Formatter, numberCodec } from "@neutrium/formatter/extensions";
import { Parser, numberParser } from "@neutrium/formatter/extensions/parse";

const numbers = new Formatter({ codecs: [numberCodec], locale: "de-DE" });
const input = new Parser({ codecs: [numberParser] });
const compiled = numbers.compile({ kind: "number" });

input.parse(compiled.format(1234.5), compiled.spec); // "1234.5"
```
