import * as prepared from "./prepared-format.js";
import { immutableSpecSnapshot } from "./immutable-snapshot.js";
import { AnyFormatCodec, FormatContext, FormatSpecBase } from "./codec.js";
import { DynamicCompiledFormatter } from "./CompiledFormatter.js";
import { createRegistry, inspectResolution } from "./registry.js";
import { FormatToken, RangeFormatToken } from "./tokens.js";
import { ColumnFormatOptions, SeriesFormatOptions } from "./series.js";
import type { CheckedSpec, CompiledFormat, FormatterSpec, FormatValue, RangeSpec, RoundedValue, SeriesSpec } from "./FormatterTypes.js";
import { FormatterOptions } from "./FormatterOptions.js";
import { DetailedFormatResult, ResolvedFormat } from "./capabilities.js";

/**
 * Strongly typed codec registry and formatting facade.
 *
 * The `Codecs` tuple determines accepted specifications, corresponding input
 * values, rounded metadata, and compiled capabilities. Most applications should use
 * the shared {@link index!formatter} or {@link index!createFormatter}; direct construction
 * starts with exactly the codecs supplied to the constructor.
 *
 * @typeParam Codecs - Ordered tuple of codecs installed on this instance.
 */
export class Formatter<const Codecs extends readonly AnyFormatCodec[] = readonly []>
{
	private readonly registry;
	private readonly installedCodecs: Codecs;
	private readonly context: FormatContext;
	private readonly compiledFormats = new WeakMap<object, prepared.PreparedFormat>();

	/**
	 * Creates a formatter from an explicit codec tuple.
	 *
	 * An omitted `codecs` option creates an empty registry. The tuple is copied and
	 * frozen, as are a shallow copy of `context` and the canonicalized default locale.
	 *
	 * @param options - Complete codec tuple, default locale (`en-US`), and application context.
	 * @throws {@link index!DuplicateFormatError} for duplicate codec kinds.
	 * @throws `TypeError` for an invalid codec kind or method shape.
	 * @example Install only number formatting
	 * ```ts
	 * import { Formatter, numberCodec } from "@neutrium/formatter/extensions";
	 *
	 * const numbers = new Formatter({ codecs: [numberCodec], locale: "de-DE" });
	 * numbers.format(1234.5, { kind: "number" }); // "1.234,5"
	 * ```
	 */
	constructor(...[options = {}]: [options: FormatterOptions<Codecs> & { codecs: Codecs }] |
		(Codecs extends readonly [] ? [options?: FormatterOptions<Codecs>] : never))
	{
		this.registry = createRegistry<Codecs>(options as FormatterOptions<Codecs>, "format");
		this.installedCodecs = this.registry.codecs;
		this.context = this.registry.context;
	}

	/**
	 * Returns an independent formatter with one additional codec.
	 *
	 * The original instance is unchanged. Its locale and context are preserved,
	 * while the returned type immediately includes the new codec's specification and
	 * value relationships.
	 *
	 * @param codec - Codec for a kind not already registered on this instance.
	 * @returns A new formatter with the added kind and its inferred value types.
	 * @throws {@link index!DuplicateFormatError} when the format kind is already installed.
	 * @throws `TypeError` for an invalid codec kind or method shape.
	 *
	 * @example Extend an empty registry
	 * ```ts
	 * import { Formatter } from "@neutrium/formatter/extensions";
	 * import type { FormatCodec } from "@neutrium/formatter/extensions";
	 *
	 * const labelCodec = {
	 *   kind: "label",
	 *   format(value: string) {
	 *     return [{ type: "literal", value }];
	 *   },
	 * } satisfies FormatCodec<"label", string>;
	 *
	 * const empty = new Formatter();
	 * const labels = empty.withCodec(labelCodec);
	 * labels.format("ready", { kind: "label" }); // "ready"
	 * empty.supports({ kind: "label" }); // false
	 * ```
	 */
	withCodec<const Codec extends AnyFormatCodec>(codec: Codec): Formatter<readonly [...Codecs, Codec]>
	{
		// Return an independent registry so existing aliases retain their declared codec set.
		return new Formatter({
			codecs: [...this.installedCodecs, codec] as const,
			locale: this.context.locale,
			context: this.context.data,
		});
	}


	/**
	 * Returns whether a complete specification can be resolved by the current runtime.
	 * Use {@link resolve} when the failure reason or effective Intl options are needed.
	 * This checks specification support, not the validity of a value to be formatted.
	 *
	 * @param spec - Complete specification to inspect, including required domain options.
	 * @returns `false` for unknown kinds, invalid options, or unavailable runtime features.
	 * @example Check options before offering a presentation
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * formatter.supports({ kind: "unit", unit: "meter" }); // true
	 * formatter.supports({ kind: "bytes", byteBase: 999 }); // false
	 * formatter.supports({ kind: "duration", presentation: "localized" });
	 * // true only when Intl.DurationFormat is available
	 * ```
	 */
	supports<Spec extends FormatSpecBase>(spec: Spec): boolean
	{
		return this.resolve(spec).supported;
	}

	/**
	 * Resolves a complete specification without throwing for ordinary validation failures.
	 *
	 * A successful result includes the effective locale, implementation, available
	 * operations, range strategy, and any backing Intl options. A failed result
	 * contains a serializable error.
	 * Formatting resolutions always report `capabilities.parse: false`. Inspect
	 * parsing separately with {@link extensions-parse!Parser.resolve}.
	 *
	 * @param spec - Complete specification to validate and inspect.
	 * @returns A result discriminated by `supported`, with capabilities or an error.
	 *
	 * @example Explain a currency's default display precision
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * function precisionHelp(currency: string): string {
	 *   const result = formatter.resolve({ kind: "currency", currency });
	 *   if (!result.supported) return `Currency display unavailable: ${result.error.message}`;
	 *   const digits = result.intl?.resolvedOptions.maximumFractionDigits;
	 *   return digits === undefined ? "Automatic precision" : `Up to ${digits} decimal places`;
	 * }
	 * precisionHelp("USD"); // "Up to 2 decimal places"
	 * precisionHelp("JPY"); // "Up to 0 decimal places"
	 * ```
	 */
	resolve<Spec extends FormatSpecBase>(spec: Spec): ResolvedFormat
	{
		return inspectResolution(spec, () => this.prepare(spec).resolution);
	}

	/**
	 * Formats a value with the codec selected by `spec.kind`.
	 *
	 * Exact decimal strings, bigints, and structurally compatible numeric objects are
	 * passed to Intl without conversion to an imprecise JavaScript number.
	 * Built-in numeric values still follow the numeric overflow/underflow limits;
	 * exact input does not prevent rounding to the requested display precision.
	 *
	 * @param value - Input accepted by the selected domain, such as a decimal string or duration record.
	 * @param spec - Domain, locale override, and presentation options.
	 * @returns Localized display text. Use {@link formatToParts} for semantic fragments.
	 * @throws {@link index!UnknownFormatError} if no matching codec is registered.
	 * @throws Decimal's `DecimalError` for invalid numeric syntax or exceeded Decimal limits.
	 * @throws `RangeError` or `TypeError` for other invalid values or specifications.
	 *
	 * @example
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * formatter.format("9007199254740993.25", {
	 *   kind: "number",
	 *   maximumFractionDigits: 2,
	 * });
	 * // "9,007,199,254,740,993.25"
	 * ```
	 */
	format<const Spec extends FormatterSpec<Codecs>>(
		value: NoInfer<FormatValue<Codecs, Spec>>,
		spec: CheckedSpec<Codecs, Spec>,
	): string;
	format<Value, Spec extends FormatSpecBase>(value: Value, spec: Spec): string
	{
		return prepared.format(this.prepare(spec), value);
	}

	/**
	 * Formats a value into stable semantic tokens.
	 *
	 * Joining each token's `value` produces the same output as {@link format}.
	 * Wrapper domains add semantic token types such as `ordinal` and duration units.
	 * Preserve literal tokens, including whitespace and bidirectional marks, when rendering.
	 *
	 * @param value - Value accepted by the selected domain.
	 * @param spec - Formatting specification.
	 * @returns Ordered tokens with `type` and `value` fields.
	 * @example Render a price with a smaller currency symbol in a browser
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * const price = document.createElement("span");
	 * const parts = formatter.formatToParts("1234.5", {
	 *   kind: "currency", currency: "EUR", locale: "de-DE",
	 * });
	 * for (const part of parts) {
	 *   const span = document.createElement("span");
	 *   span.textContent = part.value;
	 *   if (part.type === "currency") span.style.fontSize = "0.8em";
	 *   price.append(span);
	 * }
	 * document.body.append(price); // 1.234,50 € with a smaller €; spacing is preserved.
	 * ```
	 */
	formatToParts<const Spec extends FormatterSpec<Codecs>>(
		value: NoInfer<FormatValue<Codecs, Spec>>,
		spec: CheckedSpec<Codecs, Spec>,
	): readonly FormatToken[];
	formatToParts<Value, Spec extends FormatSpecBase>(value: Value, spec: Spec): readonly FormatToken[]
	{
		return prepared.formatToParts(this.prepare(spec), value);
	}

	/**
	 * Formats a value together with semantic parts and resolution metadata.
	 *
	 * Numeric and elapsed-duration presentations expose the canonical value represented
	 * by the displayed precision. Localized durations omit `roundedValue`. Compact
	 * and byte presentations report their selected scale. No parsing import is needed.
	 * Custom codecs may omit metadata or supply a different rounded value type.
	 *
	 * @param value - Value to render and inspect.
	 * @param spec - Formatting specification.
	 * @returns `text`, semantic `parts`, successful `resolution`, and optional `roundedValue` and `scale`.
	 *
	 * @example Explain a compact chart label in a tooltip
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * const value = "1234567";
	 * const result = formatter.formatDetailed(value, {
	 *   kind: "number",
	 *   notation: "compact",
	 *   maximumFractionDigits: 2,
	 * });
	 * const chartPoint = {
	 *   value, // Keep the original for calculations and chart geometry.
	 *   label: result.text,
	 *   tooltip: result.roundedValue === undefined ? "" :
	 *     `Label represents ${formatter.format(result.roundedValue, { kind: "number" })} visits`,
	 * };
	 * // { value: "1234567", label: "1.23M", tooltip: "Label represents 1,230,000 visits" }
	 * ```
	 */
	formatDetailed<const Spec extends FormatterSpec<Codecs>>(
		value: NoInfer<FormatValue<Codecs, Spec>>,
		spec: CheckedSpec<Codecs, Spec>,
	): DetailedFormatResult<RoundedValue<Codecs, Spec>>;
	formatDetailed<Value, Spec extends FormatSpecBase, Rounded = unknown>(
		value: Value,
		spec: Spec,
	): DetailedFormatResult<Rounded>
	{
		return prepared.formatDetailed<Rounded>(this.prepare(spec), value);
	}

	/**
	 * Formats multiple values with optional shared-scale selection.
	 *
	 * Automatic compact notation and byte codecs use the largest finite absolute
	 * value to select one shared magnitude by default. Pass `{ scale: "individual" }`
	 * to choose a magnitude independently for each value.
	 * This returns text only; use {@link compileSeries} to retain the selected scale
	 * for future batches or parsing. Empty inputs return an empty array after options are validated.
	 *
	 * @param values - Values in output order.
	 * @param spec - Presentation shared by all values.
	 * @param options - Scale selection; defaults to `{ scale: "shared" }`.
	 * @returns One formatted string per input, in the same order.
	 *
	 * @example
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * formatter.formatSeries([1_200, 1_500, 900], {
	 *   kind: "number",
	 *   notation: "compact",
	 *   maximumFractionDigits: 1,
	 * });
	 * // ["1.2K", "1.5K", "0.9K"]
	 * ```
	 */
	formatSeries<const Spec extends FormatterSpec<Codecs>>(
		values: readonly NoInfer<FormatValue<Codecs, Spec>>[],
		spec: CheckedSpec<Codecs, Spec>,
		options?: SeriesFormatOptions,
	): readonly string[];
	formatSeries<Value, Spec extends FormatSpecBase>(
		values: readonly Value[],
		spec: Spec,
		options: SeriesFormatOptions = {},
	): readonly string[]
	{
		return prepared.formatSeries(this.prepare(spec), values, options);
	}

	/**
	 * Formats multiple values into one semantic token array per value.
	 * Scale selection is identical to {@link formatSeries}.
	 *
	 * @param values - Values in output order.
	 * @param spec - Presentation shared by all rows.
	 * @param options - Shared or individual scale selection; defaults to shared.
	 * @returns One ordered token array per input; empty inputs return an empty array.
	 * @example Render a file-size list with smaller unit labels in a browser
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * const list = document.createElement("ul");
	 * const rows = formatter.formatSeriesToParts([1024, 1536], { kind: "bytes" });
	 * for (const parts of rows) {
	 *   const item = document.createElement("li");
	 *   for (const part of parts) {
	 *     const span = document.createElement(part.type === "unit" ? "small" : "span");
	 *     span.textContent = part.value;
	 *     item.append(span);
	 *   }
	 *   list.append(item);
	 * }
	 * document.body.append(list); // 1 KiB and 1.5 KiB, with smaller units.
	 * ```
	 */
	formatSeriesToParts<const Spec extends FormatterSpec<Codecs>>(
		values: readonly NoInfer<FormatValue<Codecs, Spec>>[],
		spec: CheckedSpec<Codecs, Spec>,
		options?: SeriesFormatOptions,
	): readonly (readonly FormatToken[])[];
	formatSeriesToParts<Value, Spec extends FormatSpecBase>(
		values: readonly Value[],
		spec: Spec,
		options: SeriesFormatOptions = {},
	): readonly (readonly FormatToken[])[]
	{
		return prepared.formatSeriesToParts(this.prepare(spec), values, options);
	}

	/**
	 * Formats multiple values and pads them into an aligned text column.
	 *
	 * Decimal alignment is the default. Width is measured in Unicode code points,
	 * not terminal cells, so consumers displaying wide glyphs or ANSI sequences
	 * should apply display-specific alignment themselves.
	 *
	 * @param values - Values in row order.
	 * @param spec - Presentation shared by all rows.
	 * @param options - Alignment (`decimal`), fill (`" "`), and scale selection (`shared`).
	 * @returns Padded strings for a monospaced text column, in input order.
	 *
	 * @example
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * formatter.formatColumn(
	 *   [1.2, 12, 123.45],
	 *   { kind: "number", maximumFractionDigits: 2 },
	 * );
	 * // ["  1.2 ", " 12   ", "123.45"]
	 * ```
	 */
	formatColumn<const Spec extends FormatterSpec<Codecs>>(
		values: readonly NoInfer<FormatValue<Codecs, Spec>>[],
		spec: CheckedSpec<Codecs, Spec>,
		options?: ColumnFormatOptions,
	): readonly string[];
	formatColumn<Value, Spec extends FormatSpecBase>(
		values: readonly Value[],
		spec: Spec,
		options: ColumnFormatOptions = {},
	): readonly string[]
	{
		return prepared.formatColumn(this.prepare(spec), values, options);
	}

	/**
	 * Formats two endpoints as a localized range.
	 *
	 * Built-in numeric codecs use native Intl ranges when possible and a
	 * locale-derived wrapper fallback for wrapper-specific presentations.
	 * Duration ranges are unsupported. Parsing a formatted range is not provided.
	 *
	 * @param start - First endpoint, accepted by the selected codec.
	 * @param end - Second endpoint, accepted by the selected codec.
	 * @param spec - Presentation applied to both endpoints.
	 * @returns Localized range text; punctuation and shared affixes depend on the locale.
	 * @throws {@link index!UnsupportedRangeError} when the selected codec has no range operation.
	 *
	 * @example
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * formatter.formatRange(1, 2, { kind: "currency", currency: "USD" });
	 * // "$1.00 – $2.00"
	 * ```
	 */
	formatRange<const Spec extends FormatterSpec<Codecs>>(
		start: NoInfer<FormatValue<Codecs, Spec>>,
		end: NoInfer<FormatValue<Codecs, Spec>>,
		spec: RangeSpec<Codecs, Spec>,
	): string;
	formatRange<Value, Spec extends FormatSpecBase>(start: Value, end: Value, spec: Spec): string
	{
		return prepared.formatRange(this.prepare(spec), start, end);
	}

	/**
	 * Formats a range into semantic tokens labelled `startRange`, `endRange`, or `shared`.
	 *
	 * @param start - First endpoint.
	 * @param end - Second endpoint.
	 * @param spec - Presentation for both endpoints.
	 * @returns Ordered tokens whose `source` identifies endpoint or shared syntax.
	 * @throws {@link index!UnsupportedRangeError} when the selected codec has no range operation.
	 * @example Highlight the upper endpoint of a range in a browser
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * const label = document.createElement("span");
	 * const parts = formatter.formatRangeToParts(1, 2, { kind: "number" });
	 * for (const part of parts) {
	 *   const span = document.createElement(part.source === "endRange" ? "strong" : "span");
	 *   span.textContent = part.value;
	 *   label.append(span);
	 * }
	 * document.body.append(label); // 1–2, with the 2 emphasized; shared punctuation is retained.
	 * ```
	 */
	formatRangeToParts<const Spec extends FormatterSpec<Codecs>>(
		start: NoInfer<FormatValue<Codecs, Spec>>,
		end: NoInfer<FormatValue<Codecs, Spec>>,
		spec: RangeSpec<Codecs, Spec>,
	): readonly RangeFormatToken[];
	formatRangeToParts<Value, Spec extends FormatSpecBase>(
		start: Value,
		end: Value,
		spec: Spec,
	): readonly RangeFormatToken[]
	{
		return prepared.formatRangeToParts(this.prepare(spec), start, end);
	}

	/**
	 * Validates, snapshots, and deeply freezes a specification into a reusable formatter.
	 *
	 * Compilation resolves support once and binds all operations. Range
	 * methods are included only when the selected presentation supports them.
	 * Specifications may contain only primitives, plain or null-prototype records,
	 * and arrays; functions, accessors, and class instances are rejected.
	 *
	 * @param spec - Specification to copy and resolve with this instance's defaults.
	 * @returns A frozen object with bound methods, a frozen `spec`, and successful `resolution`.
	 * @throws When the specification is invalid or unsupported.
	 *
	 * @example
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 *
	 * const money = formatter.compile({
	 *   kind: "currency",
	 *   currency: "USD",
	 *   maximumFractionDigits: 2,
	 * });
	 *
	 * money.format(12);       // "$12.00"
	 * money.formatRange(1, 2);
	 * ```
	 */
	compile<const Spec extends FormatterSpec<Codecs>>(spec: CheckedSpec<Codecs, Spec>): CompiledFormat<Codecs, Spec>;
	compile<Value = unknown, Spec extends FormatSpecBase = FormatSpecBase, Rounded = unknown>(
		spec: Spec,
	): DynamicCompiledFormatter<Value, Spec, Rounded>
	{
		const snapshot = immutableSpecSnapshot(spec, this.context.locale) as Readonly<Spec>;
		const format = this.prepare(snapshot);

		return this.bind<Value, Spec, Rounded>(format);
	}

	/**
	 * Selects one shared scale from the supplied values and compiles the effective specification.
	 *
	 * Automatic compact and byte scales use the largest finite absolute value.
	 * Empty, non-finite-only, and sub-threshold series bind the base magnitude
	 * (standard notation or bytes). Explicit scales are preserved. The values are
	 * used for selection only: they are not rendered, retained, or fully validated
	 * when the codec does not need them. The returned methods behave like `compile`.
	 * Custom codecs opt in through `selectSeriesSpec`; otherwise the spec is unchanged.
	 *
	 * Pass the returned `.spec` to {@link extensions-parse!Parser.compile} to parse shared-scale
	 * text; it carries the effective locale. Later calls do not select a new scale;
	 * call `compileSeries` again with the original spec to choose a new magnitude.
	 *
	 * @param values - Representative values used only to choose the shared scale.
	 * @param spec - Original presentation, optionally with a fixed exponent.
	 * @returns A compiled formatter whose frozen `.spec` encodes the effective scale.
	 * @throws For invalid specifications or invalid values encountered during scale selection.
	 * @example Keep a table's compact scale for editing and subsequent batches
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * import { parser } from "@neutrium/formatter/parse";
	 *
	 * const thousands = formatter.compileSeries([900, 1200], {
	 *   kind: "number", notation: "compact", maximumFractionDigits: 1,
	 * });
	 * thousands.format(900);          // "0.9K"
	 * thousands.format(2_000_000);     // "2,000K"
	 * parser.compile(thousands.spec).parse("0.9K"); // "900"
	 * ```
	 */
	compileSeries<const Spec extends FormatterSpec<Codecs>>(
		values: readonly NoInfer<FormatValue<Codecs, Spec>>[],
		spec: CheckedSpec<Codecs, Spec>,
	): CompiledFormat<Codecs, SeriesSpec<Codecs, Spec>>;
	compileSeries(values: readonly unknown[], spec: FormatSpecBase): DynamicCompiledFormatter<any, any, any>
	{
		const initial = this.prepare(immutableSpecSnapshot(spec, this.context.locale));

		if (!initial.codec.selectSeriesSpec)
		{
			return this.bind(initial);
		}

		const selected = prepared.selectSeriesSpec(initial, values);

		if (selected === initial.spec)
		{
			return this.bind(initial);
		}

		// Snapshot hook-owned options too; never trust a shallowly frozen returned record.
		const snapshot = immutableSpecSnapshot(selected, initial.spec.locale ?? this.context.locale);

		if (snapshot?.kind !== initial.spec.kind)
		{
			throw new TypeError("Series specification selection must preserve the format kind");
		}

		return this.bind(this.prepare(snapshot));
	}

	private bind<Value = unknown, Spec extends FormatSpecBase = FormatSpecBase, Rounded = unknown>(
		format: prepared.PreparedFormat,
	): DynamicCompiledFormatter<Value, Spec, Rounded>
	{
		this.compiledFormats.set(format.spec, format);
		return Object.freeze({
			spec: format.spec,
			resolution: format.resolution,
			format: (value: Value) => prepared.format(format, value),
			formatToParts: (value: Value) => prepared.formatToParts(format, value),
			formatDetailed: (value: Value) => prepared.formatDetailed<Rounded>(format, value),
			formatSeries: (values: readonly Value[], options?: SeriesFormatOptions) =>
				prepared.formatSeries(format, values, options),
			formatSeriesToParts: (values: readonly Value[], options?: SeriesFormatOptions) =>
				prepared.formatSeriesToParts(format, values, options),
			formatColumn: (values: readonly Value[], options?: ColumnFormatOptions) =>
				prepared.formatColumn(format, values, options),
			...(format.resolution.capabilities.range ? {
				formatRange: (start: Value, end: Value) => prepared.formatRange(format, start, end),
				formatRangeToParts: (start: Value, end: Value) => prepared.formatRangeToParts(format, start, end),
			} : {}),
		}) as DynamicCompiledFormatter<Value, Spec, Rounded>;
	}

	private prepare(spec: FormatSpecBase): prepared.PreparedFormat
	{
		// Mutable caller specifications must be resolved afresh; only compile-owned
		// snapshots are cached, and only within the instance whose context they use.
		return this.compiledFormats.get(spec) ??
			prepared.prepare(this.registry.get(typeof spec?.kind === "string" ? spec.kind : ""), spec, this.context);
	}

}
