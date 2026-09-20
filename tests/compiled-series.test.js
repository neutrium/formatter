import { parser, createParser } from "@neutrium/formatter/parse";
import test from "node:test";
import { DecimalError } from "@neutrium/decimal/arithmetic";
import assert from "node:assert/strict";
import { formatter, createFormatter, renderTokens } from "@neutrium/formatter";
import { Formatter } from "@neutrium/formatter/extensions";

test("compiled series retain automatic compact scales across every operation", () => {
	const spec = { kind: "number", notation: "compact", maximumFractionDigits: 1 };
	const values = [900, 1200];
	const compiled = formatter.compileSeries(values, spec);
	assert.deepEqual(compiled.formatSeries(values), ["0.9K", "1.2K"]);
	assert.deepEqual(compiled.formatSeries(values), formatter.formatSeries(values, spec));
	assert.equal(compiled.spec.compactExponent, 3);
	assert.equal(spec.compactExponent, undefined);
	assert.equal(parser.compile(compiled.spec).parse("0.9K"), "900");
	assert.equal(parser.parse("0.9K", compiled.spec), "900");
	assert.equal(compiled.format(2_000_000), "2,000K");
	assert.deepEqual(compiled.formatSeries([2_000_000], { scale: "individual" }), ["2,000K"]);
	assert.deepEqual(compiled.formatSeriesToParts(values).map(renderTokens), ["0.9K", "1.2K"]);
	assert.deepEqual(compiled.formatColumn(values), ["0.9K", "1.2K"]);
	assert.equal(compiled.formatRange(900, 1200), formatter.formatRange(900, 1200, compiled.spec));
	assert.equal(renderTokens(compiled.formatRangeToParts(900, 1200)), compiled.formatRange(900, 1200));
	assert.equal(compiled.formatDetailed(900).roundedValue, "900");
	assert.deepEqual(compiled.formatDetailed(900).scale, { kind: "decimal", exponent: 3 });
	assert.ok(Object.isFrozen(compiled.spec));
	assert.ok(Object.isFrozen(compiled));
	spec.maximumFractionDigits = 0;
	values.push(1e9);
	assert.equal(compiled.format(900), "0.9K");
	assert.equal(compiled.spec.maximumFractionDigits, 1);
});

test("compiled byte series retain SI and IEC scales and explicit exponents", () => {
	for (const byteBase of [1000, 1024]) {
		const compiled = formatter.compileSeries([byteBase, -2 * byteBase, NaN, Infinity], { kind: "bytes", byteBase });
		assert.equal(compiled.spec.byteExponent, 1);
		assert.equal(parser.compile(compiled.spec).parse(compiled.format(byteBase / 2)), String(byteBase / 2));
		assert.equal(compiled.format(byteBase ** 3), formatter.format(byteBase ** 3, compiled.spec));
		const explicit = formatter.compileSeries([byteBase ** 3], { kind: "bytes", byteBase, byteExponent: 0 });
		assert.equal(explicit.spec.byteExponent, 0);
	}
	const fixed = formatter.compileSeries([1e9], { kind: "number", compactExponent: 3 });
	assert.equal(fixed.spec.compactExponent, 3);
});

test("empty, non-finite, zero and sub-threshold series bind base magnitudes", () => {
	for (const values of [[], [0, -0], [NaN, Infinity, -Infinity], [1, 900]]) {
		const compact = formatter.compileSeries(values, { kind: "number", notation: "compact" });
		assert.equal(compact.spec.notation, "standard");
		assert.equal(compact.format(1e6), "1,000,000");
		assert.equal(parser.compile(compact.spec).parse(compact.format(900)), "900");
		const bytes = formatter.compileSeries(values, { kind: "bytes" });
		assert.equal(bytes.spec.byteExponent, 0);
		assert.equal(bytes.format(1024), "1,024 B");
	}
	// Shared base-scale rounding must not promote individual rows to compact units.
	const spec = { kind: "number", notation: "compact", maximumFractionDigits: 0 };
	assert.deepEqual(formatter.formatSeries([900, 999.9], spec), ["900", "1,000"]);
	assert.deepEqual(formatter.compileSeries([900, 999.9], spec).formatSeries([900, 999.9]), ["900", "1,000"]);
	assert.deepEqual(formatter.formatSeries([900, 999.9], spec, { scale: "individual" }), ["900", "1K"]);
});

test("series compilation respects locale magnitudes, currency and unit affixes", () => {
	for (const locale of ["en-US", "de-DE", "ru-RU", "ja-JP"]) {
		const configured = createFormatter({ locale });
		for (const domain of [{ kind: "number" }, { kind: "currency", currency: "USD" }, { kind: "unit", unit: "meter" }]) {
			const spec = { ...domain, notation: "compact", maximumFractionDigits: 1 };
			const values = [10000, 20000, -30000];
			const compiled = configured.compileSeries(values, spec);
			const parsing = createParser({ locale }).compile(compiled.spec);
			assert.deepEqual(compiled.formatSeries(values), configured.formatSeries(values, spec));
			for (const value of values) assert.equal(parsing.parse(compiled.format(value)), String(value));
			assert.equal(compiled.format(1e6), configured.format(1e6, compiled.spec));
		}
	}
	assert.equal(formatter.compileSeries([1e4], { kind: "number", notation: "compact", locale: "ja-JP" }).spec.compactExponent, 4);
});

test("series compilation reads scale inputs once and validates before selection", () => {
	let reads = 0;
	const value = { toValue() { reads++; return "1200"; } };
	formatter.compileSeries([value], { kind: "number", notation: "compact" });
	assert.equal(reads, 1);
	assert.throws(() => formatter.compileSeries([value], { kind: "bytes", byteBase: 999 }), RangeError);
	assert.equal(reads, 1);
	assert.throws(() => formatter.compileSeries(["bad"], { kind: "bytes" }), DecimalError);
	assert.throws(() => formatter.compileSeries([], { kind: "number", maximumFractonDigits: 1 }), RangeError);
	assert.throws(() => formatter.compileSeries([], { kind: "missing" }), /Unknown/);
});

test("custom scale selection uses context, snapshots results and resolves final capabilities", () => {
	const result = { kind: "custom", multiplier: 10, nested: { label: "before" }, parseable: false };
	let selections = 0;
	const codec = {
		kind: "custom",
		format(value, spec) { return [{ type: "literal", value: String(value / spec.multiplier) }]; },
		parse(input, spec) { return Number(input) * spec.multiplier; },
		resolve(spec) { return { parse: spec.parseable }; },
		selectSeriesSpec(values, spec, context) {
			assert.equal(this, codec);
			assert.ok(Object.isFrozen(spec));
			assert.deepEqual(values, [100]);
			assert.equal(context.locale, "de-DE");
			selections++;
			return result;
		},
	};
	const custom = new Formatter({ locale: "de-DE", codecs: [codec] });
	const compiled = custom.compileSeries([100], { kind: "custom", multiplier: 1, parseable: true });
	assert.equal(compiled.parse, undefined);
	result.multiplier = 100;
	result.nested.label = "after";
	assert.equal(compiled.spec.nested.label, "before");
	assert.ok(Object.isFrozen(compiled.spec.nested));
	assert.equal(compiled.format(100), "10");
	compiled.formatSeries([100]);
	assert.equal(selections, 1);
	const failure = new Error("selection failed");
	codec.selectSeriesSpec = () => { throw failure; };
	assert.throws(() => custom.compileSeries([], { kind: "custom" }), error => error === failure);
	codec.selectSeriesSpec = () => ({ kind: "number" });
	assert.throws(() => custom.compileSeries([], { kind: "custom" }), /preserve the format kind/);
});

test("codecs without scale selection compile normally", () => {
	const custom = new Formatter({ codecs: [{ kind: "label", format: value => [{ type: "literal", value }] }] });
	const compiled = custom.compileSeries(["text"], { kind: "label" });
	assert.equal(compiled.format("later"), "later");
	assert.equal(compiled.parse, undefined);
	const duration = formatter.compileSeries([3661], { kind: "duration", presentation: "elapsed" });
	assert.equal(parser.compile(duration.spec).parse("1:01:01"), "3661");
	assert.equal(duration.spec.presentation, "elapsed");
	const localized = formatter.compileSeries([{ hours: 1 }], { kind: "duration", presentation: "localized", style: "long" });
	assert.equal(localized.spec.presentation, "localized");
	assert.equal(localized.format({ hours: 2 }), "2 hours");
	assert.equal(localized.parse, undefined);
	assert.equal(localized.formatRange, undefined);
});

test("series compilation reads each quantity once and validates every scale-selection input", () => {
	for (const spec of [{ kind: "number", notation: "compact" }, { kind: "bytes" }, { kind: "bytes", byteBase: 1000 }]) {
		let reads = 0;
		const values = Array.from({ length: 10_000 }, (_, index) => ({
			toValue() { reads++; return index === 1 ? "-1000000" : "1"; },
		}));
		const compiled = formatter.compileSeries(values, spec);
		assert.equal(reads, values.length);
		assert.deepEqual(compiled.spec, formatter.compileSeries([-1000000, 1], spec).spec);
		assert.equal(compiled.format(1234), formatter.format(1234, compiled.spec));
		assert.throws(() => formatter.compileSeries(["1e30", "invalid"], spec), DecimalError);
	}
});
