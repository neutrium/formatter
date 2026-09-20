import { parser, createParser } from "@neutrium/formatter/parse";
import { Parser, numberParser, durationParser, type ParseCodec } from "@neutrium/formatter/extensions/parse";
import { Formatter, numberCodec, durationCodec } from "@neutrium/formatter/extensions";
import { createFormatter, formatter, type CreateFormatterOptions, type DurationFormatSpec, type NumberFormatSpec, type LocalizedDurationFormatSpec } from "@neutrium/formatter";
import type { FormatCodec, FormatSpecBase, FormatValue, BuiltInCodecs } from "@neutrium/formatter/extensions";

// @ts-expect-error Built-in formatter methods are immutable.
numberCodec.format = numberCodec.format;
// @ts-expect-error Duration formatting follows the same immutable contract.
durationCodec.format = durationCodec.format;
// @ts-expect-error Built-in parser methods are immutable.
numberParser.parse = numberParser.parse;
// @ts-expect-error Duration parsing follows the same immutable contract.
durationParser.parse = durationParser.parse;

interface Point { x: number; y: number }
interface PointSpec extends FormatSpecBase { kind: "point"; separator?: string }
const pointCodec = {
	kind: "point",
	format(point, spec) {
		return [{ type: "literal", value: `${point.x}${spec.separator ?? ","}${point.y}` }];
	},
	parse(input, spec) {
		const [x, y] = input.split(spec.separator ?? ",").map(Number);
		return { x, y };
	},
} satisfies FormatCodec<"point", Point, PointSpec, Point> & ParseCodec<"point", PointSpec, Point>;

const custom = createFormatter({ codecs: [pointCodec] });
const customParser = createParser({ codecs: [pointCodec] });
const point: Point = customParser.parse("1,2", { kind: "point" });
custom.format(point, { kind: "point" });
custom.formatSeries([point], { kind: "point" });
custom.formatColumn([point], { kind: "point" });
const compiledPoint = custom.compile({ kind: "point", separator: "," });
const parsedPoint: Point = customParser.compile(compiledPoint.spec).parse("1,2");
const pointMetadata: Point | undefined = custom.formatDetailed(point, { kind: "point" }).roundedValue;
const number: string = customParser.parse("1", { kind: "number" });
const configured = createFormatter({ locale: "de-DE" });
const exact: string = createParser({ locale: "de-DE" }).parse("1,5", { kind: "number" });
const compiledExact: string = createParser({ locale: "de-DE" }).compile({ kind: "number" }).parse("1,5");

// @ts-expect-error Custom codecs cannot weaken built-in specifications.
custom.format(point, { kind: "number" });
// @ts-expect-error Custom inputs are inferred, not caller-selected generics.
custom.format(1, { kind: "point" });
// @ts-expect-error Unknown custom options are rejected.
custom.format(point, { kind: "point", seperator: ":" });
// @ts-expect-error Unregistered kinds are rejected.
configured.format(point, { kind: "point" });
// @ts-expect-error Factory instances enforce required currency options.
configured.format(1, { kind: "currency" });
// @ts-expect-error Factory instances enforce built-in option names.
configured.compile({ kind: "number", decimalPlaces: 2 });
// @ts-expect-error This codec does not implement ranges.
custom.formatRange(point, point, { kind: "point" });
// @ts-expect-error Compiled capabilities reflect the codec's actual methods.
compiledPoint.formatRange(point, point);

const isolated = new Formatter({ codecs: [pointCodec] });
new Parser({ codecs: [pointCodec] }).parse("1,2", { kind: "point" });
// @ts-expect-error Built-ins are unavailable when explicitly excluded.
isolated.format(1, { kind: "number" });
const empty = new Formatter();
// @ts-expect-error An empty constructor has no registered formats.
empty.format(1, { kind: "number" });
const direct = new Formatter({ codecs: [pointCodec, numberCodec, durationCodec] });
direct.format(point, { kind: "point" });
direct.format(1, { kind: "number" });
// @ts-expect-error Direct constructors enforce value/specification relationships too.
direct.format(point, { kind: "number" });
// @ts-expect-error Only explicitly provided codecs are present.
direct.format(1, { kind: "bytes" });
const extended = empty.withCodec(pointCodec).withCodec(numberCodec);
extended.format(point, { kind: "point" });
extended.format(1, { kind: "number" });
// @ts-expect-error Extension does not change the original instance's type or registry.
empty.format(point, { kind: "point" });

const labelCodec = {
	kind: "label",
	format: (value: string) => [{ type: "literal", value }],
} satisfies FormatCodec<"label", string>;
const labelFormatter = new Formatter({ codecs: [labelCodec] });
labelFormatter.format("hello", { kind: "label" });
// @ts-expect-error One-argument codec implementations retain their input types.
labelFormatter.format(1, { kind: "label" });

const options: CreateFormatterOptions = { locale: "de-DE" };
const configuredFromOptions = createFormatter(options);
configuredFromOptions.format(1, { kind: "number" });
const withPoint = { codecs: [pointCodec] } satisfies CreateFormatterOptions<readonly [typeof pointCodec]>;
createFormatter(withPoint).format(point, { kind: "point" });
createFormatter(withPoint).format(1, { kind: "number" });
// @ts-expect-error Use new Formatter for a registry without built-ins.
createFormatter({ includeBuiltIns: false });

const duration = formatter.compile({ kind: "duration", presentation: "localized", style: "long" });
duration.format({ hours: 1 });
// @ts-expect-error Elapsed presentations require scalar values.
formatter.format({ hours: 1 }, { kind: "duration", presentation: "elapsed" });
const elapsed: string = parser.compile({ kind: "duration", presentation: "elapsed" }).parse("1:00:00");
const defaultLocalized = formatter.compile({ kind: "duration", presentation: "localized" });
defaultLocalized.format({ hours: 1 });
// @ts-expect-error Duration presentation is required.
formatter.format(1, { kind: "duration" });
// @ts-expect-error A style cannot implicitly select duration presentation.
formatter.format(1, { kind: "duration", style: "long" });
// @ts-expect-error Localized-only options cannot be supplied to elapsed presentation.
formatter.format(1, { kind: "duration", presentation: "elapsed", numberingSystem: "latn" });
declare const dynamicDuration: DurationFormatSpec;
const maybeDuration = direct.compile(dynamicDuration);
// @ts-expect-error Narrow the presentation before compiling a duration parser.
parser.compile(maybeDuration.spec);

void parsedPoint;
void pointMetadata;
void number;
void exact;
void compiledExact;
void elapsed;

declare const mixedSpec: NumberFormatSpec | LocalizedDurationFormatSpec;
// @ts-expect-error A value must be safe for every possible presentation of a union specification.
formatter.format({ hours: 1 }, mixedSpec);
formatter.format(1, mixedSpec);
// @ts-expect-error Union value type must be safe for both codecs.
const mixedValue: FormatValue<BuiltInCodecs, typeof mixedSpec> = { hours: 1 };
void mixedValue;

const metadataCodec = {
	kind: "metadata",
	format: (value: number) => [{ type: "literal", value: String(value) }],
	formatDetailed: (input: number) => ({ parts: [], roundedValue: { x: input, y: 0 } }),
} satisfies FormatCodec<"metadata", number, FormatSpecBase, Point>;
const metadataFormatter = new Formatter({ codecs: [metadataCodec] });
const metadataPoint: Point | undefined = metadataFormatter.formatDetailed(1, { kind: "metadata" }).roundedValue;
// @ts-expect-error A metadata hook does not implement the ParseCodec contract.
new Parser({ codecs: [metadataCodec] });
void metadataPoint;

// @ts-expect-error Explicit type arguments cannot invent codecs that were never installed.
new Formatter<readonly [typeof numberCodec]>();
// @ts-expect-error Non-empty registry types require their codecs at construction.
new Formatter<readonly [typeof numberCodec]>({ locale: "en-US" });
// @ts-expect-error An empty instance cannot be assigned to a built-in registry type.
const fabricated: Formatter<BuiltInCodecs> = new Formatter();
void fabricated;
// @ts-expect-error The factory also requires any explicitly claimed custom codecs.
createFormatter<readonly [typeof pointCodec]>();
// @ts-expect-error A type argument alone cannot install a custom codec.
createFormatter<readonly [typeof pointCodec]>({ locale: "en-US" });
