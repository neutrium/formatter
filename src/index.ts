/**
 * Format exact values as localized text with `@neutrium/formatter`.
 *
 * Start with {@link index!formatter}, or use {@link index!createFormatter} for another
 * default locale. {@link extensions!Formatter} provides text, parts, detailed results,
 * collections, ranges, and compiled presentations. Every call selects its domain
 * through `spec.kind`; specification types document each domain's options.
 *
 * Import strict parsing from `@neutrium/formatter/parse`, runtime feature checks
 * from `@neutrium/formatter/diagnostics`, and codec-authoring types from
 * `@neutrium/formatter/extensions`.
 * @module
 */
export { formatter } from "./formatter.js";
export { createFormatter } from "./create-formatter.js";
export { renderTokens } from "./core/tokens.js";
export {
	DuplicateFormatError,
	UnknownFormatError,
	UnsupportedParseError,
	UnsupportedOrdinalLocaleError,
	UnsupportedRangeError,
} from "./core/errors.js";
export type { CompiledFormatter } from "./core/CompiledFormatter.js";
export type {
	DetailedFormatResult,
	FormatCapabilities,
	FormatImplementation,
	FormatResolutionError,
	FormatScale,
	FormatValueMetadata,
	IntlFormatMetadata,
	RangeImplementation,
	ResolvedFormat,
} from "./core/capabilities.js";
export type {
	BuiltInFormatTokenType,
	FormatToken,
	FormatTokenType,
	RangeFormatToken,
	RangeTokenSource,
} from "./core/tokens.js";
export type { CreateFormatterOptions } from "./create-formatter.js";
export type { BuiltInFormatSpec, BuiltInFormatValue } from "./specs.js";
export type {
	DurationDateUnitStyle,
	ElapsedDurationFormatSpec,
	DurationFormatSpec,
	DurationRecordValue,
	DurationStyle,
	DurationSubsecondUnitStyle,
	DurationTimeUnitStyle,
	DurationUnitDisplay,
	DurationValue,
	LocalizedDurationFormatSpec,
	LocalizedDurationOptions,
} from "./duration/spec.js";
export type {
	ColumnAlignment,
	ColumnFormatOptions,
	SeriesFormatOptions,
	SeriesScale,
} from "./core/series.js";
export type {
	BytesFormatSpec,
	CurrencyFormatSpec,
	NumberNotation,
	NumberFormatSpec,
	NumericFormatSpec,
	OrdinalFormatSpec,
	PercentageFormatSpec,
	UnitFormatSpec,
} from "./numeric/specs.js";
export type {
	GroupingDisplay,
	NegativeDisplay,
	NumericDisplayOptions,
	NumericValue,
	NumericValueObject,
	RoundingMode,
	RoundingPriority,
	SignDisplay,
} from "./types.js";
