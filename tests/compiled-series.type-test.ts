import { parser } from "@neutrium/formatter/parse";
import { Parser, type ParseCodec } from "@neutrium/formatter/extensions/parse";
import { formatter, createFormatter, type NumberFormatSpec, type DurationFormatSpec } from "@neutrium/formatter";
import { Formatter, durationCodec } from "@neutrium/formatter/extensions";
import type { FormatCodec } from "@neutrium/formatter/extensions";

const compact = formatter.compileSeries([900, "1200", 1500n], {
	kind: "number", notation: "compact", maximumFractionDigits: 1,
});
const exponent: number | undefined = compact.spec.compactExponent;
const effective: NumberFormatSpec = compact.spec;
const parsed: string = parser.compile(compact.spec).parse("0.9K");
compact.formatRange(900, 1200);
parser.parse("0.9K", compact.spec);
// @ts-expect-error Selection may change compact notation to standard for the base magnitude.
const notation: "compact" = compact.spec.notation;
// @ts-expect-error The effective spec is immutable.
compact.spec.compactExponent = 6;
// @ts-expect-error Input values must match the selected codec.
formatter.compileSeries([{ hours: 1 }], { kind: "number" });
// @ts-expect-error Unknown numeric option.
formatter.compileSeries([1], { kind: "number", maximumFractonDigits: 1 });
const bytes = formatter.compileSeries([1024], { kind: "bytes" });
const byteExponent: number | undefined = bytes.spec.byteExponent;
parser.compile(bytes.spec).parse("1 KiB");

const codec = {
	kind: "point",
	format(value: { x: number }) { return [{ type: "literal", value: String(value.x) }]; },
	parse(input: string, _spec: { kind: "point" }) { return { x: Number(input) }; },
} satisfies FormatCodec<"point", { x: number }, { kind: "point" }> & ParseCodec<"point", { kind: "point" }, { x: number }>;
const point = new Formatter({ codecs: [codec] }).compileSeries([{ x: 1 }], { kind: "point" });
const p: { x: number } = new Parser({ codecs: [codec] }).compile(point.spec).parse("1");
// @ts-expect-error Custom codec has no range operation.
point.formatRange({ x: 1 }, { x: 2 });

// A selector may change the presentation. Do not retain the input's literal options.
const selectable = {
	kind: "selectable",
	format(value: number, spec: { kind: "selectable"; scale?: number }) { return [{ type: "literal", value: String(value / (spec.scale ?? 1)) }]; },
	selectSeriesSpec(): { kind: "selectable"; scale: number } { return { kind: "selectable", scale: 10 }; },
};
const selected = new Formatter({ codecs: [selectable] }).compileSeries([100], { kind: "selectable" });
const scale: number = selected.spec.scale;
// @ts-expect-error Series selection does not implement the ParseCodec contract.
new Parser({ codecs: [selectable] });
void [exponent, effective, parsed, notation, byteExponent, p, scale];

// A codec without a selector preserves the caller's precise presentation.
const configured = createFormatter({ locale: "de-DE" });
const isolated = new Formatter({ codecs: [durationCodec] });
for (const elapsed of [
	formatter.compileSeries([1, "2", 3n], { kind: "duration", presentation: "elapsed" }),
	configured.compileSeries([1], { kind: "duration", presentation: "elapsed" }),
	isolated.compileSeries([1], { kind: "duration", presentation: "elapsed" }),
]) {
	const seconds: string = parser.compile(elapsed.spec).parse("0:00:01");
	const elapsedPresentation: "elapsed" = elapsed.spec.presentation;
	elapsed.format(2);
	// @ts-expect-error Elapsed durations accept scalar inputs, not records.
	elapsed.format({ hours: 2 });
	// @ts-expect-error Elapsed durations do not support ranges.
	elapsed.formatRange(1, 2);
	void [seconds, elapsedPresentation];
}
for (const localized of [
	formatter.compileSeries([{ hours: 1 }], { kind: "duration", presentation: "localized" }),
	configured.compileSeries([{ hours: 1 }], { kind: "duration", presentation: "localized" }),
	isolated.compileSeries([{ hours: 1 }], { kind: "duration", presentation: "localized" }),
]) {
	const localizedPresentation: "localized" = localized.spec.presentation;
	localized.format({ hours: 2 });
	localized.format(3600);
	localized.formatSeries([{ minutes: 1 }, 60]);
	localized.formatDetailed({ hours: 2 });
	// @ts-expect-error Localized duration parsing is absent, not merely optional.
	parser.compile(localized.spec);
	// @ts-expect-error Localized durations do not support ranges.
	localized.formatRange({ hours: 1 }, { hours: 2 });
	void localizedPresentation;
}

declare const dynamicDuration: DurationFormatSpec;
const dynamic = formatter.compileSeries([1], dynamicDuration);
// @ts-expect-error Dynamic presentations must be narrowed before parsing.
parser.compile(dynamic.spec);
// @ts-expect-error Records are unsafe when the dynamic presentation could be elapsed.
dynamic.format({ hours: 1 });
