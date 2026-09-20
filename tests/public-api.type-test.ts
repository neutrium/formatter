import { parser, createParser } from "@neutrium/formatter/parse";
import { type ParseCodec } from "@neutrium/formatter/extensions/parse";
import { runtimeCapabilities as inspectRuntime, type RuntimeCapabilities } from "@neutrium/formatter/diagnostics";
import {
	formatter as builtInFormatter,
	createFormatter,
	type DurationFormatSpec,
	type DurationRecordValue,
	type DetailedFormatResult,
	type ResolvedFormat,
	type NumberNotation,
	type NegativeDisplay,
	type NumericValueObject,
	type SeriesFormatOptions,
	type RangeFormatToken,
	type RoundingMode,
	type UnitFormatSpec,
} from "@neutrium/formatter";
import type { FormatCodec, FormatSpecBase } from "@neutrium/formatter/extensions";
import { Decimal } from "@neutrium/decimal";

const formatted: string = builtInFormatter.format(1234.5, {
	kind: "number",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});
const roundingMode: RoundingMode = "halfEven";
const rounded: string = builtInFormatter.format("1.245", {
	kind: "number",
	maximumFractionDigits: 2,
	roundingMode,
});
const notation: NumberNotation = "engineering";
const negativeDisplay: NegativeDisplay = "parentheses";
const exponential: string = builtInFormatter.format(12345, {
	kind: "number",
	notation,
	maximumSignificantDigits: 4,
});
const exact: string = parser.parse("1.2M", { kind: "number", notation: "compact" });
const forcedCompact: string = builtInFormatter.format(1200000, {
	kind: "number",
	compactExponent: 6,
	minimumIntegerDigits: 2,
});
const special: string = builtInFormatter.format(NaN, {
	kind: "number",
	nanDisplay: "not available",
	infinityDisplay: "∞",
	zeroDisplay: "—",
});
const parts = builtInFormatter.formatToParts(new Decimal("12"), { kind: "currency", currency: "USD" });
parts.forEach((part) => part.value);
const range: string = builtInFormatter.formatRange(1, 2, { kind: "currency", currency: "AUD" });
const rangeParts: readonly RangeFormatToken[] = builtInFormatter.formatRangeToParts(1, 2, { kind: "number" });
rangeParts.forEach((part) => part.source);
const compiled = builtInFormatter.compile({ kind: "number", maximumFractionDigits: 2, negativeDisplay });
const compiledValue: string = compiled.format("1.234");
const compiledParsed: string = parser.compile(compiled.spec).parse("1.23");
const compiledRange: string = compiled.formatRange(1, 2);
const durationSpec: DurationFormatSpec = { kind: "duration", presentation: "elapsed", inputUnit: "milliseconds" };
const duration: string = parser.parse("1:01:01", durationSpec);
const durationRecord: DurationRecordValue = { days: 1, hours: 2, minutes: 3 };
const localizedDuration: string = builtInFormatter.format(durationRecord, { kind: "duration", presentation: "localized", style: "long" });
const localizedDurationFormatter = builtInFormatter.compile({ kind: "duration", presentation: "localized", style: "long" });
const compiledDuration: string = localizedDurationFormatter.format(durationRecord);
// @ts-expect-error Duration codecs do not support ranges.
localizedDurationFormatter.formatRange(durationRecord, durationRecord);
const elapsedDurationFormatter = builtInFormatter.compile({ kind: "duration", presentation: "elapsed" });
const parsedElapsedDuration: string = parser.compile(elapsedDurationFormatter.spec).parse("1:01:01");
const seriesOptions: SeriesFormatOptions = { scale: "shared" };
const series: readonly string[] = builtInFormatter.formatSeries([1200, 1500], {
	kind: "number",
	notation: "compact",
}, seriesOptions);
const seriesParts = builtInFormatter.formatSeriesToParts([1024, 2048], { kind: "bytes" });
const column: readonly string[] = builtInFormatter.formatColumn([1.2, 12], { kind: "number" }, { align: "decimal" });
const valueObject: NumericValueObject = { toValue: () => "1234.5" };
const structural: string = builtInFormatter.format(valueObject, { kind: "number" });
const runtimeCapabilities: RuntimeCapabilities = inspectRuntime();
const supported: boolean = builtInFormatter.supports({ kind: "unit", unit: "meter" });
const resolvedFormat: ResolvedFormat = builtInFormatter.resolve({ kind: "number" });
if (resolvedFormat.supported)
{
	resolvedFormat.locale;
}
else
{
	resolvedFormat.error.message;
}
const detailed: DetailedFormatResult<string> = builtInFormatter.formatDetailed(1200, {
	kind: "number",
	notation: "compact",
});
const unitSpec: UnitFormatSpec = {
	kind: "unit",
	unit: "kilometer-per-hour",
	unitDisplay: "long",
};
const localizedUnit: string = builtInFormatter.format(valueObject, unitSpec);
const parsedUnit: string = parser.parse("1,234.5 kilometers per hour", unitSpec);
const unitRange: string = builtInFormatter.formatRange(1, 2, unitSpec);
const unitFormatter = builtInFormatter.compile(unitSpec);
unitFormatter.formatSeries([1, 2]);
const compiledResolution: ResolvedFormat = unitFormatter.resolution;
const compiledDetailed: DetailedFormatResult<string> = unitFormatter.formatDetailed(1);
const detailedText: string = detailed.text;
const detailedResolution: ResolvedFormat = detailed.resolution;
// @ts-expect-error Detailed output is named text, not value.
detailed.value;
// @ts-expect-error Resolution has one name across detailed and compiled results.
compiledDetailed.resolved;
void detailedText;
void detailedResolution;
const localizedFormatter = createFormatter({ locale: "en-AU" });
localizedFormatter.format(0.25, { kind: "percentage" });
localizedFormatter.format(1234.5, { kind: "number", locale: "de-DE" });

// @ts-expect-error A discriminated format specification is required.
builtInFormatter.format(1234.5, { maximumFractionDigits: 2 });
// @ts-expect-error Legacy option names are intentionally absent after the clean break.
builtInFormatter.format(1.2, { kind: "number", decimalPlaces: 2 });
// @ts-expect-error Currency is now always an ISO 4217 string.
builtInFormatter.format(1.2, { kind: "currency", currency: { symbol: "$" } });
// @ts-expect-error Duration ranges are not part of the built-in range API.
builtInFormatter.formatRange(1, 2, { kind: "duration", presentation: "elapsed" });
// @ts-expect-error Duration records cannot be formatted with numeric specifications.
builtInFormatter.format(durationRecord, { kind: "number" });
// @ts-expect-error Duration records must opt into localized presentation explicitly.
builtInFormatter.format(durationRecord, { kind: "duration", presentation: "elapsed" });
// @ts-expect-error Unit presentation requires an Intl unit identifier.
builtInFormatter.format(1, { kind: "unit" });

interface Coordinate {
	x: number;
	y: number;
}

interface CoordinateSpec extends FormatSpecBase {
	kind: "coordinate";
	separator?: string;
}

const coordinateCodec: FormatCodec<"coordinate", Coordinate, CoordinateSpec, Coordinate> & ParseCodec<"coordinate", CoordinateSpec, Coordinate> = {
	kind: "coordinate",
	format(value, options) {
		return [
			{ type: "coordinate-x", value: String(value.x) },
			{ type: "literal", value: options.separator || "," },
			{ type: "coordinate-y", value: String(value.y) },
		];
	},
	formatRange(start, end, options) {
		return [
			{ type: "coordinate-x", value: String(start.x), source: "startRange" },
			{ type: "literal", value: options.separator || ",", source: "shared" },
			{ type: "coordinate-x", value: String(end.x), source: "endRange" },
		];
	},
	parse(value, options) {
		const [x, y] = value.split(options.separator || ",").map(Number);
		return { x, y };
	},
};

const formatter = createFormatter({ codecs: [coordinateCodec] });
const coordinateSpec: CoordinateSpec = { kind: "coordinate", separator: ":" };
const coordinate: Coordinate = createParser({ codecs: [coordinateCodec] }).parse("10:20", coordinateSpec);
formatter.format(coordinate, coordinateSpec);
formatter.formatRange(coordinate, { x: 30, y: 40 }, coordinateSpec);

void formatted;
void rounded;
void exponential;
void exact;
void forcedCompact;
void special;
void duration;
void localizedDuration;
void compiledDuration;
void parsedElapsedDuration;
void series;
void seriesParts;
void column;
void structural;
void valueObject;
void range;
void compiledValue;
void compiledParsed;
void compiledRange;
void localizedUnit;
void parsedUnit;
void unitRange;
void runtimeCapabilities;
void supported;
void resolvedFormat;
void detailed;
void compiledResolution;
void compiledDetailed;

// @ts-expect-error Runtime diagnostics are not instance operations.
builtInFormatter.runtimeCapabilities();
// @ts-expect-error Registry-only inspection is not public.
builtInFormatter.has("number");
// @ts-expect-error Currency requires an ISO 4217 currency identifier.
builtInFormatter.format(1, { kind: "currency" });
// @ts-expect-error Unit identifiers are required for series formatting too.
builtInFormatter.formatSeries([1, 2], { kind: "unit" });
