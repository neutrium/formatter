/**
 * Structurally compatible exact numeric object, such as `@neutrium/decimal`.
 * The returned string uses numeric syntax accepted by Decimal, including radix
 * prefixes and digit separators, rather than localized presentation syntax.
 *
 * @example Supply an exact value from an application object
 * ```ts
 * import { formatter, type NumericValueObject } from "@neutrium/formatter";
 *
 * const amount = { toValue: () => "9007199254740993.25" } satisfies NumericValueObject;
 * formatter.format(amount, { kind: "number", maximumFractionDigits: 2 });
 * // "9,007,199,254,740,993.25"
 * ```
 */
export interface NumericValueObject
{
	/** Returns an exact numeric string in a syntax accepted by Decimal. */
	toValue(): string;
}

/**
 * Numeric inputs accepted by all built-in numeric codecs.
 *
 * Strings, bigints, and {@link NumericValueObject} instances avoid conversion to
 * an imprecise JavaScript `number` for finite, nonzero values. Strings use Decimal's
 * syntax, including `"1234.5"`, `"1.25e3"`, `"1_000"`, `"0xff"`, `"0b1010"`, and
 * `"0o17"`. Surrounding whitespace is ignored. Parse localized text such as
 * `"1,234.5"` with `@neutrium/formatter/parse` first.
 * Numeric domains normalize overflow to infinity and underflow to signed zero.
 */
export type NumericValue = string | number | bigint | NumericValueObject;

/**
 * Rounding direction names accepted by modern `Intl.NumberFormat`.
 *
 * `ceil` and `floor` round toward positive and negative infinity; `expand` and
 * `trunc` round away from and toward zero. The `half*` modes apply the named
 * direction only to ties, with `halfEven` selecting the nearest even result.
 */
export type RoundingMode =
	| "ceil"
	| "floor"
	| "expand"
	| "trunc"
	| "halfCeil"
	| "halfFloor"
	| "halfExpand"
	| "halfTrunc"
	| "halfEven";

/**
 * Controls when Intl includes a sign in formatted output.
 * `exceptZero` signs non-zero values, `negative` excludes negative zero, and
 * `never` suppresses both signs.
 */
export type SignDisplay = "auto" | "always" | "exceptZero" | "negative" | "never";
/** Wrapper-level choice between a locale sign and surrounding parentheses. */
export type NegativeDisplay = "sign" | "parentheses";
/**
 * Controls localized digit grouping using Intl semantics.
 * `min2` displays separators only when the highest group contains at least two digits.
 */
export type GroupingDisplay = boolean | "auto" | "always" | "min2";
/** Resolves conflicts between fraction-digit and significant-digit precision. */
export type RoundingPriority = "auto" | "morePrecision" | "lessPrecision";

/**
 * Intl-style options shared by every numeric format specification.
 *
 * Unspecified precision options retain the defaults of the selected Intl style.
 * Part overrides retain locale-derived positions; `zeroDisplay` replaces the
 * entire output when the displayed coefficient rounds to zero.
 *
 * @example Set fixed precision and tie-breaking behavior
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format("1.245", {
 *   kind: "number", minimumFractionDigits: 2, maximumFractionDigits: 2,
 *   roundingMode: "halfEven",
 * }); // "1.24"
 *
 * formatter.format("0.001", {
 *   kind: "number", maximumFractionDigits: 2, zeroDisplay: "—",
 * }); // "—"
 * ```
 */
export interface NumericDisplayOptions
{
	/** BCP 47 locale overriding the formatter default for this operation. */
	locale?: string;
	/** Unicode numbering-system identifier, such as `latn` or `arab`. */
	numberingSystem?: string;
	/** Localized digit-grouping behavior. */
	useGrouping?: GroupingDisplay;
	/** Minimum number of integer digits. */
	minimumIntegerDigits?: number;
	/** Minimum fraction digits, padding with zeros as needed. Set both fraction limits for fixed precision. */
	minimumFractionDigits?: number;
	/** Maximum fraction digits, rounding excess digits. Does not require that many digits to be shown. */
	maximumFractionDigits?: number;
	/** Minimum number of significant digits. */
	minimumSignificantDigits?: number;
	/** Maximum number of significant digits. */
	maximumSignificantDigits?: number;
	/** Rounding direction used when precision reduces the value. Defaults to `halfExpand`. */
	roundingMode?: RoundingMode;
	/**
	 * Increment at the configured fraction precision. For example, `5` with both
	 * fraction limits set to `2` rounds to multiples of `0.05`. Intl requires equal
	 * fraction limits and rejects incompatible significant-digit options.
	 */
	roundingIncrement?: number;
	/** Chooses the winning precision rule when fraction and significant digits are both configured. */
	roundingPriority?: RoundingPriority;
	/** Whether insignificant trailing zeroes are retained. */
	trailingZeroDisplay?: "auto" | "stripIfInteger";
	/** Controls when a positive or negative sign is displayed. */
	signDisplay?: SignDisplay;
	/** Render displayed negative signs as parentheses. Defaults to "sign". */
	negativeDisplay?: NegativeDisplay;
	/** Replace the locale-derived grouping part after Intl formatting. */
	groupSeparator?: string;
	/** Replace the locale-derived decimal part after Intl formatting. */
	decimalSeparator?: string;
	/**
	 * Whole-output replacement for displayed zero, including rounded and negative zero.
	 * Omits signs and affixes. Parsing recognizes it as `"0"` before ordinary numeric
	 * syntax, so choose text that does not collide with a nonzero presentation.
	 */
	zeroDisplay?: string;
	/** Replacement for the localized `NaN` magnitude. */
	nanDisplay?: string;
	/** Replacement for the localized infinity magnitude. */
	infinityDisplay?: string;
}
