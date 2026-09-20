import type { ParseCodec } from "../core/Parser.js";
import { byteEngine, nativeEngine, ordinalEngine, percentageEngine } from "./engines.js";
import type { NumericEngine } from "./shared/engine.js";
import { createNumericParserPreparation } from "./shared/parser.js";
import { registerParserPreparation } from "../core/parser-preparation.js";
import type { NumericParseGrammar } from "./shared/parse-grammar.js";
import { byteGrammar } from "./bytes/grammar.js";
import { nativeGrammar } from "./native/grammar.js";
import { ordinalGrammar } from "./ordinal/grammar.js";
import { percentageGrammar } from "./percentage/grammar.js";
import type { NumericFormatSpec } from "./specs.js";
function createNumericParser<Kind extends NumericFormatSpec["kind"]>(kind: Kind, engine: NumericEngine, grammar: NumericParseGrammar): Readonly<ParseCodec<Kind, Extract<NumericFormatSpec, {
	kind: Kind;
}>, string>> {
	const prepare = createNumericParserPreparation(engine, grammar);
	const codec: ParseCodec<Kind, Extract<NumericFormatSpec, { kind: Kind }>, string> = {
		kind,
		parse: (input, spec, context) => prepare(spec, context).parse(input),
		resolve: (spec, context) => prepare(spec, context).resolve(),
	};
	registerParserPreparation(codec, prepare);
	return codec;
}
/**
 * Built-in parser for localized numbers, including scientific and compact notation.
 * Already installed on {@link parse!parser} and instances made by {@link parse!createParser}.
 * Returns canonical strings. Use a fixed compact exponent to parse shared-scale text.
 *
 * @example Build an isolated parser from a built-in codec
 * ```ts
 * import { Parser, numberParser } from "@neutrium/formatter/extensions/parse";
 *
 * const numbers = new Parser({ codecs: [numberParser] });
 * numbers.parse("1.23M", { kind: "number", notation: "compact" }); // "1230000"
 * ```
 */
export const numberParser = /* @__PURE__ */ createNumericParser("number", nativeEngine, nativeGrammar);
/**
 * Built-in currency parser returning canonical strings after validating locale and currency affixes.
 * Already installed by {@link parse!createParser}.
 * @example
 * ```ts
 * import { parser } from "@neutrium/formatter/parse";
 * parser.parse("($12.50)", { kind: "currency", currency: "USD", currencySign: "accounting" });
 * // "-12.5"
 * ```
 */
export const currencyParser = /* @__PURE__ */ createNumericParser("currency", nativeEngine, nativeGrammar);
/**
 * Built-in ratio parser, reversing `percentageScale` (default `100`) into a canonical string.
 * Already installed by {@link parse!createParser}.
 * @example
 * ```ts
 * import { parser } from "@neutrium/formatter/parse";
 * parser.parse("12.5%", { kind: "percentage", maximumFractionDigits: 1 }); // "0.125"
 * ```
 */
export const percentageParser = /* @__PURE__ */ createNumericParser("percentage", percentageEngine, percentageGrammar);
/**
 * Built-in unit parser returning canonical values in the specified unit, without unit conversion.
 * Already installed by {@link parse!createParser}.
 * @example
 * ```ts
 * import { parser } from "@neutrium/formatter/parse";
 * parser.parse("12.5 meters", { kind: "unit", unit: "meter", unitDisplay: "long" }); // "12.5"
 * ```
 */
export const unitParser = /* @__PURE__ */ createNumericParser("unit", nativeEngine, nativeGrammar);
/**
 * Built-in ordinal parser validating the locale's patterns or explicit `ordinalPatterns`.
 * Already installed by {@link parse!createParser}; returns a canonical numeric string.
 * @example
 * ```ts
 * import { parser } from "@neutrium/formatter/parse";
 * parser.parse("23rd", { kind: "ordinal" }); // "23"
 * ```
 */
export const ordinalParser = /* @__PURE__ */ createNumericParser("ordinal", ordinalEngine, ordinalGrammar);
/**
 * Built-in byte-size parser, reversing SI or IEC suffixes into an exact byte-count string.
 * Already installed by {@link parse!createParser}; defaults to IEC base `1024`.
 * @example
 * ```ts
 * import { parser } from "@neutrium/formatter/parse";
 * parser.parse("1.5 KiB", { kind: "bytes" }); // "1536"
 * ```
 */
export const bytesParser = /* @__PURE__ */ createNumericParser("bytes", byteEngine, byteGrammar);
export const numericParsers = [numberParser, currencyParser, percentageParser, unitParser, ordinalParser, bytesParser] as const;
