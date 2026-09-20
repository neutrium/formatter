import { NegativeDisplay, NumericValue, RoundingMode, SignDisplay } from "../types.js";

/** Localized duration presentation styles accepted by `Intl.DurationFormat`. */
export type DurationStyle = "long" | "short" | "narrow" | "digital";
/** Styles accepted by calendar-unit components. */
export type DurationDateUnitStyle = "long" | "short" | "narrow";
/** Styles accepted by hour, minute, and second components. */
export type DurationTimeUnitStyle = DurationDateUnitStyle | "numeric" | "2-digit";
/** Styles accepted by subsecond components. */
export type DurationSubsecondUnitStyle = DurationDateUnitStyle | "numeric";
/** Controls whether a zero-valued duration component is shown. */
export type DurationUnitDisplay = "auto" | "always";

/**
 * Calendar/time duration record compatible with `Temporal.Duration` and
 * `Intl.DurationFormat` field names.
 *
 * At least one field must be present. Every supplied field must be a safe integer,
 * and non-zero fields must all have the same sign.
 *
 * @example
 * ```ts
 * import { formatter, type DurationRecordValue } from "@neutrium/formatter";
 *
 * const duration = { days: 1, hours: 2, minutes: 30 } satisfies DurationRecordValue;
 * formatter.format(duration, { kind: "duration", presentation: "localized", style: "long" });
 * // "1 day, 2 hours, 30 minutes"
 * ```
 */
export interface DurationRecordValue
{
	/** Calendar years component. */
	readonly years?: number;
	/** Calendar months component. */
	readonly months?: number;
	/** Calendar weeks component. */
	readonly weeks?: number;
	/** Days component. */
	readonly days?: number;
	/** Hours component. */
	readonly hours?: number;
	/** Minutes component. */
	readonly minutes?: number;
	/** Seconds component. */
	readonly seconds?: number;
	/** Milliseconds component. */
	readonly milliseconds?: number;
	/** Microseconds component. */
	readonly microseconds?: number;
	/** Nanoseconds component. */
	readonly nanoseconds?: number;
}

/**
 * Elapsed scalar or calendar/time record accepted by localized duration formatting.
 * The parseable `H:MM:SS` presentation accepts only scalar {@link NumericValue} inputs.
 */
export type DurationValue = NumericValue | DurationRecordValue;

/**
 * Options for explicitly localized component presentation.
 *
 * These options require `presentation: "localized"`, which is format-only,
 * and a native or polyfilled `Intl.DurationFormat` implementation.
 */
export interface LocalizedDurationOptions
{
	/** Unicode numbering-system identifier used for numeric components. */
	numberingSystem?: string;
	/** Localized presentation style. Defaults to `short`. */
	style?: DurationStyle;
	/** Fraction digits shown for seconds and used to round scalar inputs; integer from `0` to `9`. */
	fractionalDigits?: number;
	/** Presentation style for the years component. */
	years?: DurationDateUnitStyle;
	/** Presentation style for the months component. */
	months?: DurationDateUnitStyle;
	/** Presentation style for the weeks component. */
	weeks?: DurationDateUnitStyle;
	/** Presentation style for the days component. */
	days?: DurationDateUnitStyle;
	/** Presentation style for the hours component. */
	hours?: DurationTimeUnitStyle;
	/** Presentation style for the minutes component. */
	minutes?: DurationTimeUnitStyle;
	/** Presentation style for the seconds component. */
	seconds?: DurationTimeUnitStyle;
	/** Presentation style for the milliseconds component. */
	milliseconds?: DurationSubsecondUnitStyle;
	/** Presentation style for the microseconds component. */
	microseconds?: DurationSubsecondUnitStyle;
	/** Presentation style for the nanoseconds component. */
	nanoseconds?: DurationSubsecondUnitStyle;
	/** Whether a zero-valued years component is omitted or always displayed. */
	yearsDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued months component is omitted or always displayed. */
	monthsDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued weeks component is omitted or always displayed. */
	weeksDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued days component is omitted or always displayed. */
	daysDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued hours component is omitted or always displayed. */
	hoursDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued minutes component is omitted or always displayed. */
	minutesDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued seconds component is omitted or always displayed. */
	secondsDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued milliseconds component is omitted or always displayed. */
	millisecondsDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued microseconds component is omitted or always displayed. */
	microsecondsDisplay?: DurationUnitDisplay;
	/** Whether a zero-valued nanoseconds component is omitted or always displayed. */
	nanosecondsDisplay?: DurationUnitDisplay;
}

/** @inline */
interface DurationOptions
{
	/** Selects the built-in duration codec. */
	kind: "duration";
	/** BCP 47 locale overriding the formatter default for this operation. */
	locale?: string;
	/** Unit of scalar inputs and parsed results. Defaults to `seconds`. */
	inputUnit?: "milliseconds" | "seconds";
	/** Rounding direction for fractional scalar values. Defaults to `halfExpand`. */
	roundingMode?: RoundingMode;
	/** Controls when a positive or negative sign is displayed. */
	signDisplay?: SignDisplay;
	/** Uses a localized sign or surrounding parentheses for negative values. */
	negativeDisplay?: NegativeDisplay;
}

/**
 * Localized duration text from scalar values or calendar/time records.
 *
 * Requires native or polyfilled `Intl.DurationFormat`. This presentation cannot
 * be parsed, does not support ranges, and omits `roundedValue` in detailed output.
 * Scalars use {@link inputUnit}; records use their named components without
 * converting calendar months or years into a scalar duration.
 *
 * @example Display fractional seconds in a digital timer
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format({ seconds: 1, milliseconds: 500 }, {
 *   kind: "duration", presentation: "localized", style: "digital", fractionalDigits: 3,
 * });
 * // "0:00:01.500"
 * ```
 */
export interface LocalizedDurationFormatSpec extends DurationOptions, LocalizedDurationOptions
{
	/** Selects localized, format-only duration text. Always required. */
	presentation: "localized";
}

/**
 * Exact scalar duration displayed as `H:MM:SS`, with unbounded total hours.
 *
 * Fractions are rounded to whole seconds using `roundingMode`. Scalar inputs and
 * parsed results use seconds by default, or milliseconds with `inputUnit`.
 * Records and localized component options are rejected. No `Intl.DurationFormat`
 * service is needed. Ranges are unsupported.
 *
 * @example Format and parse a millisecond duration
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 * import { parser } from "@neutrium/formatter/parse";
 *
 * const spec = { kind: "duration", presentation: "elapsed", inputUnit: "milliseconds" } as const;
 * formatter.format(3661000, spec);  // "1:01:01"
 * parser.parse("1:01:01", spec);   // "3661000"
 * ```
 */
export type ElapsedDurationFormatSpec = DurationOptions & {
	/** Selects scalar, parseable `H:MM:SS` output. Always required. */
	presentation: "elapsed";
} & { [Key in keyof LocalizedDurationOptions]?: never };

/**
 * Duration specification with an explicitly selected presentation.
 *
 * Choose {@link ElapsedDurationFormatSpec | `presentation: "elapsed"`} for
 * parseable scalar `H:MM:SS`, or
 * {@link LocalizedDurationFormatSpec | `presentation: "localized"`} for
 * format-only scalar and record presentation. Presentation is required; setting
 * `style` alone does not select a mode. Neither mode supports ranges.
 *
 * @example Choose elapsed or localized output
 * ```ts
 * import { formatter } from "@neutrium/formatter";
 *
 * formatter.format(3661, { kind: "duration", presentation: "elapsed" });
 * // "1:01:01"
 *
 * formatter.format({ hours: 3, minutes: 25 }, {
 *   kind: "duration", presentation: "localized", style: "long",
 * });
 * // "3 hours, 25 minutes"
 * ```
 */
export type DurationFormatSpec = ElapsedDurationFormatSpec | LocalizedDurationFormatSpec;
