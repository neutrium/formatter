import type { NumericDisplayOptions } from "../../types.js";

/** Notation styles delegated to `Intl.NumberFormat`; defaults to `standard`. */
export type NumberNotation = "standard" | "scientific" | "engineering" | "compact";

/** Shared notation options for number, currency and unit presentations. @inline */
interface NotationOptions
{
	/** Decimal notation style. Defaults to `standard`. */
	notation?: NumberNotation;
	/** Short or long affixes for compact notation. Defaults to `short`. */
	compactDisplay?: "short" | "long";
	/**
	 * Fixes a power-of-ten scale while retaining the locale's compact affix.
	 * The exponent must start a compact magnitude in the selected locale.
	 */
	compactExponent?: number;
}

/**
 * Locale-aware decimal number specification.
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
export interface NumberFormatSpec extends NumericDisplayOptions, NotationOptions
{
	/** Selects the built-in number codec. */
	kind: "number";
}

/**
 * Locale-aware currency specification.
 *
 * @example
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format(-1234.5, {
 *   kind: "currency",
 *   currency: "USD",
 *   currencySign: "accounting",
 * });
 * // "($1,234.50)"
 * ```
 */
export interface CurrencyFormatSpec extends NumericDisplayOptions, NotationOptions
{
	/** Selects the built-in currency codec. */
	kind: "currency";
	/** ISO 4217 currency code, such as `USD`, `EUR`, or `AUD`. */
	currency: string;
	/** Locale currency label style. Defaults to `symbol`. */
	currencyDisplay?: "code" | "symbol" | "narrowSymbol" | "name";
	/** Standard or accounting negative presentation. Defaults to `standard`. */
	currencySign?: "standard" | "accounting";
	/** Replace the locale-derived currency part without changing its placement. */
	currencySymbol?: string;
}

/**
 * Locale-aware measurement-unit specification.
 *
 * This is presentation only: values are not converted between units.
 *
 * @example
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format(12.5, {
 *   kind: "unit",
 *   unit: "kilometer-per-hour",
 *   unitDisplay: "long",
 * });
 * // "12.5 kilometers per hour"
 * ```
 */
export interface UnitFormatSpec extends NumericDisplayOptions, NotationOptions
{
	/** Selects the built-in measurement-unit codec. */
	kind: "unit";
	/** An Intl sanctioned simple or compound unit identifier, such as "meter" or "kilometer-per-hour". */
	unit: string;
	/** Width of the localized unit label. Defaults to `short`. */
	unitDisplay?: "short" | "narrow" | "long";
	/** Replace the locale-derived unit part without changing its placement. */
	unitSymbol?: string;
}
