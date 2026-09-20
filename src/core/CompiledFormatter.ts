import { FormatSpecBase } from "./codec.js";
import { FormatToken, RangeFormatToken } from "./tokens.js";
import { ColumnFormatOptions, SeriesFormatOptions } from "./series.js";
import { DetailedFormatResult, SupportedResolvedFormat } from "./capabilities.js";

import type { CompiledSpec } from "./immutable-snapshot.js";

/**
 * Common operations on an immutable specification bound to a {@link extensions!Formatter}.
 *
 * This type describes the common rendering operations. Prefer an inferred
 * compiled result (or `typeof` an existing result) to retain its exact range
 * capabilities; unsupported methods are omitted automatically.
 * All methods are bound and may be passed as callbacks. Obtain this object from
 * {@link extensions!Formatter.compile} or {@link extensions!Formatter.compileSeries}; it has no parser
 * methods. Use {@link extensions-parse!Parser.compile} on its `spec` to create a matching parser.
 *
 * @typeParam Value - Value accepted by formatting operations.
 * @typeParam Spec - Bound specification type.
 * @typeParam Rounded - Exact value reported as rounded metadata.
 */
export interface CompiledFormatter<Value = unknown, Spec extends FormatSpecBase = FormatSpecBase, Rounded = unknown>
{
	/** Deeply frozen bound specification including the effective locale and any selected series scale. */
	readonly spec: CompiledSpec<Spec>;
	/** Cached successful resolution for {@link spec}. */
	readonly resolution: SupportedResolvedFormat;
	/**
	 * Formats one value using the bound specification and locale.
	 * @param value - Value accepted by the bound domain.
	 * @returns Localized text.
	 * @example Pass a compiled method as a callback
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * const money = formatter.compile({ kind: "currency", currency: "USD" });
	 * [12.5, 20].map(money.format); // ["$12.50", "$20.00"]
	 * ```
	 */
	format(value: Value): string;
	/**
	 * Formats one value into semantic tokens, preserving localized literals.
	 * @param value - Value accepted by the bound domain.
	 * @returns Tokens that render to the same text as {@link format}.
	 * @example Render the currency label at a smaller size in a browser
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * const money = formatter.compile({ kind: "currency", currency: "USD" });
	 * const price = document.createElement("span");
	 * for (const part of money.formatToParts(12.5)) {
	 *   const span = document.createElement(part.type === "currency" ? "small" : "span");
	 *   span.textContent = part.value;
	 *   price.append(span);
	 * }
	 * document.body.append(price); // $12.50 with a smaller $.
	 * ```
	 */
	formatToParts(value: Value): readonly FormatToken[];
	/**
	 * Formats one value with tokens, resolution, and any available rounded value and scale.
	 * @param value - Value to render and inspect.
	 * @returns Detailed output; optional metadata depends on the domain and presentation.
	 * @example Produce chart labels with an explanation of rounded values
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * const compact = formatter.compile({ kind: "number", compactExponent: 6, maximumFractionDigits: 2 });
	 * const points = ["1234567", "2345678"].map(value => {
	 *   const result = compact.formatDetailed(value);
	 *   return {
	 *     value,
	 *     label: result.text,
	 *     tooltip: result.roundedValue === undefined ? "" :
	 *       `Label represents ${formatter.format(result.roundedValue, { kind: "number" })} visits`,
	 *   };
	 * });
	 * // First point: { value: "1234567", label: "1.23M", tooltip: "Label represents 1,230,000 visits" }
	 * ```
	 */
	formatDetailed(value: Value): DetailedFormatResult<Rounded>;
	/**
	 * Formats several values, sharing an automatic compact or byte scale by default.
	 * A fixed scale in {@link spec}, including one selected by `compileSeries`, takes
	 * precedence over individual scale selection.
	 * @param values - Values in output order.
	 * @param options - Scale selection, defaulting to shared.
	 * @returns One string per input; no values returns an empty array.
	 * @example Compare shared and individual scales
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * const size = formatter.compile({ kind: "bytes" });
	 * size.formatSeries([512, 1536]); // ["0.5 KiB", "1.5 KiB"]
	 * size.formatSeries([512, 1536], { scale: "individual" }); // ["512 B", "1.5 KiB"]
	 * ```
	 */
	formatSeries(values: readonly Value[], options?: SeriesFormatOptions): readonly string[];
	/**
	 * Formats several values into one semantic token array per value.
	 * @param values - Values in output order.
	 * @param options - Shared or individual scale selection, as in {@link formatSeries}.
	 * @returns Ordered token arrays for each input row.
	 * @example Build table cells with smaller unit labels in a browser
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * const size = formatter.compile({ kind: "bytes" });
	 * const cells = size.formatSeriesToParts([1024, 1536]).map(parts => {
	 *   const cell = document.createElement("td");
	 *   for (const part of parts) {
	 *     const span = document.createElement(part.type === "unit" ? "small" : "span");
	 *     span.textContent = part.value;
	 *     cell.append(span);
	 *   }
	 *   return cell;
	 * });
	 * // Append each cell to its file's table row: 1 KiB and 1.5 KiB, with smaller units.
	 * ```
	 */
	formatSeriesToParts(values: readonly Value[], options?: SeriesFormatOptions): readonly (readonly FormatToken[])[];
	/**
	 * Formats and pads a column for monospaced text, measuring Unicode code points.
	 * @param values - Values in row order.
	 * @param options - Alignment (`decimal`), fill (`" "`), and scale selection (`shared`).
	 * @returns Padded strings; use application-specific alignment for terminal cell widths.
	 * @example Right-align a plain-text report
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * const number = formatter.compile({ kind: "number" });
	 * number.formatColumn([1, 20, 300], { align: "right" }); // ["  1", " 20", "300"]
	 * ```
	 */
	formatColumn(values: readonly Value[], options?: ColumnFormatOptions): readonly string[];
}

/** A compiled formatter whose resolved presentation supports ranges. */
export interface RangeCompiledFormatter<
	Value = unknown,
	Spec extends FormatSpecBase = FormatSpecBase,
	Rounded = unknown,
> extends CompiledFormatter<Value, Spec, Rounded> {
	/**
	 * Formats two endpoints using the bound specification's range presentation.
	 * @param start - First endpoint.
	 * @param end - Second endpoint.
	 * @returns Localized range text.
	 * @example
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * const number = formatter.compile({ kind: "number" });
	 * number.formatRange(1, 2); // "1–2"
	 * ```
	 */
	formatRange(start: Value, end: Value): string;
	/**
	 * Formats a range into tokens labelled as start, end, or shared syntax.
	 * @param start - First endpoint.
	 * @param end - Second endpoint.
	 * @returns Ordered tokens with `startRange`, `endRange`, or `shared` sources.
	 * @example Emphasize the upper end of a price range in a browser
	 * ```ts
	 * import { formatter } from "@neutrium/formatter";
	 * const money = formatter.compile({ kind: "currency", currency: "USD" });
	 * const label = document.createElement("span");
	 * for (const part of money.formatRangeToParts(10, 20)) {
	 *   const span = document.createElement(part.source === "endRange" ? "strong" : "span");
	 *   span.textContent = part.value;
	 *   label.append(span);
	 * }
	 * document.body.append(label); // $10.00 – $20.00, with the upper endpoint emphasized.
	 * ```
	 */
	formatRangeToParts(start: Value, end: Value): readonly RangeFormatToken[];
}

/**
 * Compiled formatter whose range capabilities are known only after
 * runtime resolution. Test optional methods before calling them.
 */
export type DynamicCompiledFormatter<
	Value = unknown,
	Spec extends FormatSpecBase = FormatSpecBase,
	Rounded = unknown,
> = CompiledFormatter<Value, Spec, Rounded> &
	Partial<Pick<RangeCompiledFormatter<Value, Spec, Rounded>, "formatRange" | "formatRangeToParts">>;
