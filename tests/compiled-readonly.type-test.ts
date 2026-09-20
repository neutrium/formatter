import { parser } from "@neutrium/formatter/parse";
import { formatter } from "@neutrium/formatter";
import { Formatter } from "@neutrium/formatter/extensions";
import type { FormatCodec, FormatSpecBase } from "@neutrium/formatter/extensions";

const spec = { kind: "ordinal" as const, ordinalPatterns: { other: "{number}th" } };
const ordinal = formatter.compile(spec);
// @ts-expect-error Frozen even though the caller's inferred nested type is mutable.
ordinal.spec.ordinalPatterns.other = "{number}x";
for (const compiled of [formatter.compile(spec), formatter.compileSeries([1], spec)]) {
	if (compiled.spec.ordinalPatterns) {
		// @ts-expect-error Nested options are frozen.
		compiled.spec.ordinalPatterns.other = "{number}x";
		const pattern: string = compiled.spec.ordinalPatterns.other;
		void pattern;
	}
	const parsed: string = parser.compile(compiled.spec).parse("1th");
	void parsed;
}
spec.ordinalPatterns.other = "{number}x"; // Caller-owned data remains mutable.

interface CustomSpec extends FormatSpecBase {
	kind: "custom";
	nested: { rows: { label: string }[]; tuple: [string, { count: number }] };
	self?: CustomSpec;
}
const codec = { kind: "custom", format: (_value: number, _spec: CustomSpec) => [] } satisfies FormatCodec<"custom", number, CustomSpec>;
const custom = new Formatter({ codecs: [codec] });
const options: CustomSpec = { kind: "custom", nested: { rows: [{ label: "x" }], tuple: ["first", { count: 1 }] } };
for (const compiled of [custom.compile(options), custom.compileSeries([], options)]) {
	// @ts-expect-error Frozen nested array.
	compiled.spec.nested.rows.push({ label: "y" });
	// @ts-expect-error Frozen array element.
	compiled.spec.nested.rows[0].label = "y";
	// @ts-expect-error Frozen tuple.
	compiled.spec.nested.tuple[0] = "second";
	// @ts-expect-error Frozen tuple element.
	compiled.spec.nested.tuple[1].count = 2;
	if (compiled.spec.self) {
		// @ts-expect-error Recursive records remain readonly.
		compiled.spec.self.nested.rows = [];
	}
	const tuple: readonly [string, { readonly count: number }] = compiled.spec.nested.tuple;
	void tuple;
}
