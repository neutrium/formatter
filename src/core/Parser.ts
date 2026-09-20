import type { CodecFormatResolution, FormatContext, FormatSpecBase } from "./codec.js";
import type { ResolvedFormat, SupportedResolvedFormat } from "./capabilities.js";
import { immutableSpecSnapshot } from "./immutable-snapshot.js";
import { createRegistry, inspectResolution } from "./registry.js";
import { resolveFormat } from "./resolution.js";
import { UnsupportedParseError } from "./errors.js";
import type { CompiledSpec } from "./immutable-snapshot.js";
import type { RegistryOptions } from "./RegistryOptions.js";
import { getParserPreparation } from "./parser-preparation.js";

/**
 * Defines how one application-specific domain is parsed.
 *
 * Register it with {@link parse!createParser} or {@link extensions-parse!Parser.withCodec}. Share the
 * specification type with your formatting codec, but import this type from
 * `@neutrium/formatter/extensions/parse`. The parser must validate the entire input and throw
 * when it cannot return a valid value; the registry does not validate its result.
 *
 * @typeParam Kind - Literal discriminator selecting this parser.
 * @typeParam Spec - Accepted specification, including domain-specific options.
 * @typeParam Value - Result returned by parsing; it need not be numeric.
 *
 * @example Parse a custom status field
 * ```ts
 * import { createParser } from "@neutrium/formatter/parse";
 * import { type ParseCodec } from "@neutrium/formatter/extensions/parse";
 *
 * const statusParser = {
 *   kind: "status",
 *   parse(input) {
 *     if (input === "Enabled") return true;
 *     if (input === "Disabled") return false;
 *     throw new TypeError("Expected Enabled or Disabled");
 *   },
 * } satisfies ParseCodec<"status", { kind: "status" }, boolean>;
 *
 * const statuses = createParser({ codecs: [statusParser] });
 * statuses.parse("Enabled", { kind: "status" }); // true, inferred as boolean
 * statuses.parse("1,234", { kind: "number" });   // "1234" — built-ins remain available
 * ```
 */
export interface ParseCodec<Kind extends string = string, Spec extends FormatSpecBase = FormatSpecBase, Value = unknown>
{
	/** Unique discriminator matched against the specification's `kind`. */
	readonly kind: Kind;
	/** Converts a complete input string to a domain value, or throws for invalid input. */
	parse(input: string, spec: Spec, context: FormatContext): Value;
	/** Validates a specification without parsing input; may throw or return `parse: false` to reject it. */
	resolve?(spec: Spec, context: FormatContext): CodecFormatResolution;
}

/** @internal */
export type AnyParseCodec = ParseCodec<string, any, any>;
/** @inline */
type CodecSpec<Codec extends AnyParseCodec, Spec = Parameters<Codec["parse"]>[1]> =
	Spec extends FormatSpecBase ? Spec : FormatSpecBase;
/** Specifications accepted by the installed parser codecs. */
export type ParserSpec<Codecs extends readonly AnyParseCodec[]> = Codecs[number] extends infer Codec
	? Codec extends AnyParseCodec ? CodecSpec<Codec> & {
		/** Discriminator selecting the parser for this specification. */
		kind: Codec["kind"];
	} : never : never;
/** Result inferred from the specification's registered parser. */
export type ParsedValue<Codecs extends readonly AnyParseCodec[], Spec> = Spec extends {
	/** Discriminator identifying the requested parser. */
	kind: infer Kind;
} ? ReturnType<Extract<Codecs[number], {
	/** Discriminator identifying the matching installed parser. */
	kind: Kind;
}>["parse"]> : never;
/** @inline */
type Keys<Value> = Value extends unknown ? keyof Value : never;
/** @inline */
type CheckedSpec<Codecs extends readonly AnyParseCodec[], Spec> = Spec & FormatSpecBase &
	Record<Exclude<keyof Spec, Keys<Extract<ParserSpec<Codecs>, { kind: Spec extends {kind: infer Kind} ? Kind : never }>> | keyof FormatSpecBase>, never>;

/** Options for an explicit parser registry; factories also include the built-in parsers. */
export interface ParserOptions<Codecs extends readonly AnyParseCodec[] = readonly []>
	extends RegistryOptions<Codecs> {}

/**
 * Reusable parser returned by {@link extensions-parse!Parser.compile}.
 *
 * The specification and resolution are deeply frozen. The bound `parse` method
 * can be passed directly to `Array.map`; it always exists after compilation succeeds.
 *
 * @typeParam Value - Parsed result; built-in parsers return canonical strings.
 * @typeParam Spec - Bound specification type.
 *
 * @example Parse a column of currency inputs
 * ```ts
 * import { parser } from "@neutrium/formatter/parse";
 *
 * const money = parser.compile({ kind: "currency", currency: "USD" });
 * ["$12.25", "$20.00"].map(money.parse); // ["12.25", "20"]
 * ```
 */
export interface CompiledParser<Value = unknown, Spec extends FormatSpecBase = FormatSpecBase>
{
	/** Deeply copied and frozen specification, including its effective locale. */
	readonly spec: CompiledSpec<Spec>;
	/** Successful, cached parsing resolution; rendering capabilities are false. */
	readonly resolution: SupportedResolvedFormat;
	/**
	 * Parses text using the bound locale and specification; invalid input throws.
	 *
	 * @param input - Complete localized presentation to parse.
	 * @returns The parser codec's domain value.
	 * @example
	 * ```ts
	 * import { parser } from "@neutrium/formatter/parse";
	 * const percent = parser.compile({ kind: "percentage", maximumFractionDigits: 1 });
	 * percent.parse("12.5%"); // "0.125"
	 * ```
	 */
	parse(input: string): Value;
}

/**
 * Parses localized text using the codecs installed on this instance.
 *
 * Most applications should use {@link parse!parser} or {@link parse!createParser}, which
 * include every built-in parser. Direct construction creates an empty registry
 * unless codecs are supplied. Locale and application context are independent
 * of any formatter instance; compiled specifications carry their bound locale.
 *
 * @typeParam Codecs - Installed parser tuple, used to infer specifications and results.
 * @example Create an isolated number parser
 * ```ts
 * import { Parser, numberParser } from "@neutrium/formatter/extensions/parse";
 * const numbers = new Parser({ codecs: [numberParser], locale: "de-DE" });
 * numbers.parse("1.234,5", { kind: "number" }); // "1234.5"
 * ```
 */
export class Parser<const Codecs extends readonly AnyParseCodec[] = readonly []>
{
	private readonly registry;
	private readonly compiledParsers = new WeakMap<object, { parse(input: string): any; resolution: SupportedResolvedFormat }>();
	/**
	 * Creates a parser with exactly the supplied codecs, or an empty registry.
	 *
	 * @param options - Codec tuple, default locale (`en-US`), and application context.
	 * @throws {@link index!DuplicateFormatError} for duplicate codec kinds.
	 * @throws `TypeError` for an invalid codec kind or method shape.
	 * @throws `RangeError` for an invalid locale identifier.
	 * @example
	 * ```ts
	 * import { Parser, bytesParser } from "@neutrium/formatter/extensions/parse";
	 * const sizes = new Parser({ codecs: [bytesParser] });
	 * sizes.parse("1.5 KiB", { kind: "bytes" }); // "1536"
	 * ```
	 */
	constructor(...[options = {}]: [options: ParserOptions<Codecs> & { codecs: Codecs }] |
		(Codecs extends readonly [] ? [options?: ParserOptions<Codecs>] : never))
	{
		this.registry = createRegistry<Codecs>(options as ParserOptions<Codecs>, "parse");
	}

	/**
	 * Returns an independent parser with one additional codec, preserving locale and context.
	 *
	 * @param codec - Parser for a kind not already installed on this instance.
	 * @returns A new parser whose inferred types include the added codec.
	 * @throws {@link index!DuplicateFormatError} if the kind is already registered.
	 * @throws `TypeError` for an invalid codec kind or method shape.
	 * @example
	 * ```ts
	 * import { Parser, numberParser } from "@neutrium/formatter/extensions/parse";
	 * const empty = new Parser();
	 * const numbers = empty.withCodec(numberParser);
	 * numbers.parse("1,234", { kind: "number" }); // "1234"
	 * empty.supports({ kind: "number" });          // false
	 * ```
	 */
	withCodec<const Codec extends AnyParseCodec>(codec: Codec): Parser<readonly [...Codecs, Codec]>
	{
		return new Parser({ codecs: [...this.registry.codecs, codec] as const,
			locale: this.registry.context.locale, context: this.registry.context.data });
	}

	/**
	 * Checks whether a complete specification can be parsed on this runtime.
	 * This checks options and available codecs, not the validity of an input string.
	 * Use {@link resolve} when the failure reason is needed.
	 *
	 * @param spec - Specification to inspect, including required domain options.
	 * @returns `false` for unknown kinds, invalid options, or unsupported presentations.
	 * @example
	 * ```ts
	 * import { parser } from "@neutrium/formatter/parse";
	 * const elapsed = { kind: "duration", presentation: "elapsed" } as const;
	 * const localized = { kind: "duration", presentation: "localized" } as const;
	 * parser.supports(elapsed);   // true
	 * parser.supports(localized); // false
	 * ```
	 */
	supports(spec: FormatSpecBase): boolean
	{
		return this.resolve(spec).supported;
	}

	/**
	 * Inspects parsing support, returning a serializable error for a rejected specification.
	 * Check `supported` before reading success-only fields. Rendering capabilities
	 * are always false; use a formatter's `resolve` to inspect formatting separately.
	 *
	 * @param spec - Complete specification to inspect.
	 * @returns A successful resolution or the reason parsing is unavailable.
	 * @example Explain an unsupported presentation
	 * ```ts
	 * import { parser } from "@neutrium/formatter/parse";
	 *
	 * const spec = { kind: "duration", presentation: "localized" } as const;
	 * const result = parser.resolve(spec);
	 * if (!result.supported) {
	 *   console.error(`This display cannot be used as an editable duration: ${result.error.message}`);
	 * }
	 * ```
	 */
	resolve(spec: FormatSpecBase): ResolvedFormat
	{
		return inspectResolution(spec, () => this.prepare(spec).resolution);
	}

	/**
	 * Parses one complete localized string into the selected codec's result type.
	 *
	 * Built-in numeric and elapsed-duration parsers return canonical decimal
	 * strings, preserving exact digits while removing presentation padding. Parsing
	 * recovers displayed precision: `"1.23M"` represents `"1230000"`. Grouping,
	 * affixes, signs, and scales must match the specification. Surrounding whitespace
	 * is tolerated after an exact presentation match is attempted.
	 *
	 * @param input - Complete localized text, not a string containing an embedded number.
	 * @param spec - The presentation and locale used to produce or accept the text.
	 * @returns A canonical string for built-ins, or the custom parser's result type.
	 * @throws {@link index!UnknownFormatError} if no parser is installed for the kind.
	 * @throws {@link parse!UnsupportedParseError} if a presentation is not parseable.
	 * @throws `TypeError` or `RangeError` for invalid input or options.
	 * @example Parse localized input and handle invalid text
	 * ```ts
	 * import { parser } from "@neutrium/formatter/parse";
	 *
	 * parser.parse("1.234,50", { kind: "number", locale: "de-DE" }); // "1234.5"
	 * parser.parse("12.5%", { kind: "percentage", maximumFractionDigits: 1 }); // "0.125"
	 * try {
	 *   parser.parse("12,34.5", { kind: "number" }); // invalid en-US grouping
	 * } catch (error) {
	 *   console.error(error instanceof Error ? error.message : String(error));
	 * }
	 * ```
	 */
	parse<const Spec extends ParserSpec<Codecs>>(input: string, spec: CheckedSpec<Codecs, Spec>): ParsedValue<Codecs, Spec>;
	parse(input: string, spec: FormatSpecBase): unknown
	{
		return this.prepare(spec).parse(input);
	}

	/**
	 * Validates and freezes a specification for repeated parsing.
	 *
	 * Later edits to the original specification have no effect. The returned
	 * `parse` method is bound and safe to pass as a callback. Specifications may
	 * contain primitives, plain records, and arrays; class instances, functions,
	 * and accessors are rejected. A successful compile always provides `parse`.
	 *
	 * @param spec - Specification to copy and resolve with this parser's defaults.
	 * @returns A frozen parser with `spec`, successful `resolution`, and bound `parse`.
	 * @throws For invalid or unsupported specifications, preserving the original error.
	 * @example Parse using a compiled formatter's selected scale
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * import { parser } from "@neutrium/formatter/parse";
	 *
	 * const thousands = formatter.compileSeries([900, 1200], {
	 *   kind: "number", notation: "compact", maximumFractionDigits: 1,
	 * });
	 * const inputs = parser.compile(thousands.spec);
	 * ["0.9K", "1.2K"].map(inputs.parse); // ["900", "1200"]
	 * ```
	 */
	compile<const Spec extends ParserSpec<Codecs>>(spec: CheckedSpec<Codecs, Spec>): CompiledParser<ParsedValue<Codecs, Spec>, Spec>;
	compile(spec: FormatSpecBase): CompiledParser<any, any>
	{
		const snapshot = immutableSpecSnapshot(spec, this.registry.context.locale);
		const prepared = this.prepare(snapshot);
		this.compiledParsers.set(snapshot, prepared);
		const { parse, resolution } = prepared;

		return Object.freeze({
			spec: snapshot,
			resolution,
			parse
		});
	}

	private prepare(spec: FormatSpecBase)
	{
		const cached = this.compiledParsers.get(spec);

		if (cached)
		{
			return cached;
		}

		const codec = this.registry.get(typeof spec?.kind === "string" ? spec.kind : "");
		const execution = getParserPreparation(codec)?.(spec, this.registry.context);
		const resolution = resolveFormat(execution ?? codec, spec, this.registry.context, "parse");

		if (!resolution.capabilities.parse)
		{
			throw new UnsupportedParseError(spec.kind);
		}

		return { parse: execution?.parse ?? ((input: string) => codec.parse(input, spec, this.registry.context)), resolution };
	}
}
