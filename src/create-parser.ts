import { Parser, type AnyParseCodec, type ParserOptions } from "./core/Parser.js";
import { numericParsers } from "./numeric/parse-codecs.js";
import { durationParser } from "./duration/parse-codec.js";

const builtInParsers = [...numericParsers, durationParser] as const;
/** Tuple of built-in parsers, for typing custom parser wrappers. */
export type BuiltInParsers = typeof builtInParsers;

/** Options for {@link parse!createParser}. */
export interface CreateParserOptions<Codecs extends readonly AnyParseCodec[] = readonly []>
	extends ParserOptions<Codecs> {}

/**
 * Creates an independent parser with all built-in domains and additional custom codecs.
 * Use `Parser` from `@neutrium/formatter/extensions/parse` for an isolated registry.
 *
 * @param options - Default locale (`en-US`), application context, and additional codecs.
 * @returns A parser with inferred specification and result types.
 * @throws {@link index!DuplicateFormatError} for duplicate kinds, including built-in kinds.
 * @throws `TypeError` for an invalid codec kind or method shape.
 * @throws `RangeError` for an invalid locale identifier.
 * @example Pair formatting and parsing for one locale
 * ```ts
 * import { createFormatter } from "@neutrium/formatter";
 * import { createParser } from "@neutrium/formatter/parse";
 *
 * const display = createFormatter({ locale: "de-DE" });
 * const input = createParser({ locale: "de-DE" });
 * const spec = { kind: "number" } as const;
 * input.parse(display.format("1234.5", spec), spec); // "1234.5"
 * ```
 */
export function createParser(options?: CreateParserOptions): Parser<BuiltInParsers>;
export function createParser<const Codecs extends readonly AnyParseCodec[]>(
	options: CreateParserOptions<Codecs> & { codecs: Codecs },
): Parser<readonly [...BuiltInParsers, ...Codecs]>;
export function createParser(options: CreateParserOptions<readonly AnyParseCodec[]> = {}): Parser<any>
{
	return new Parser({
		codecs: [...builtInParsers, ...(options.codecs ?? [])],
		locale: options.locale, context: options.context
	});
}
