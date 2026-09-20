import type { NumericDisplayOptions } from "../../types.js";

/**
 * Locale-aware percentage or other power-of-ten ratio specification.
 *
 * @example Format basis points
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format("0.0125", {
 *   kind: "percentage",
 *   percentageScale: 10_000,
 *   percentageSymbol: " bp",
 *   maximumFractionDigits: 0,
 * });
 * // "125 bp"
 * ```
 */
export interface PercentageFormatSpec extends NumericDisplayOptions
{
	/** Selects the built-in percentage codec. */
	kind: "percentage";
	/** Positive power of ten applied before display and reversed during parsing. Defaults to `100`. */
	percentageScale?: number;
	/** Replaces the locale-derived percent-sign part without changing its placement. */
	percentageSymbol?: string;
}
