import { countNumberParts, withProperty } from "./helpers/intl-probes.js";
import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";
import { Formatter, numberCodec, bytesCodec } from "@neutrium/formatter/extensions";

test("ranges parse each endpoint once across native and wrapper paths", () => {
	for (const method of [Intl.NumberFormat.prototype.formatRangeToParts, undefined]) {
		withProperty(Intl.NumberFormat.prototype, "formatRangeToParts", { value: method }, () => {
			for (const spec of [
				{ kind: "number" },
				{ kind: "number", negativeDisplay: "parentheses", maximumFractionDigits: 0, roundingMode: "floor" },
				{ kind: "number", negativeDisplay: "parentheses", signDisplay: "negative", maximumFractionDigits: 0 },
				{ kind: "number", negativeDisplay: "parentheses", signDisplay: "never" },
				{ kind: "number", zeroDisplay: "zero", infinityDisplay: "infinite" },
				{ kind: "number", notation: "compact" },
				{ kind: "number", compactExponent: 3 },
				{ kind: "currency", currency: "USD", currencySign: "accounting" },
				{ kind: "currency", currency: "USD", negativeDisplay: "parentheses" },
				{ kind: "unit", unit: "meter", unitSymbol: "m" },
				{ kind: "percentage", percentageScale: 10000 },
				{ kind: "bytes" }, { kind: "bytes", byteBase: 1000, byteExponent: 2 },
				{ kind: "ordinal" },
			]) {
				const compiled = formatter.compile(spec);
				for (const [start, end] of [["1.234", "5.678"], ["-1.5", "2.5"], ["-0", "0"], ["-0.001", "0.001"],
					["9007199254740993.125", "9007199254740994.875"], ["-Infinity", "Infinity"]]) {
					for (const method of ["formatRange", "formatRangeToParts"]) {
						for (const run of [
							(left, right) => formatter[method](left, right, spec),
							(left, right) => compiled[method](left, right),
						]) {
							const expected = run(start, end);
							const reads = [0, 0];
							const values = [start, end].map((value, index) => ({ toValue() {
								assert.equal(++reads[index], 1, "Each endpoint must be read only once");
								return value;
							} }));
							assert.deepEqual(run(...values), expected);
							assert.deepEqual(reads, [1, 1]);
						}
					}
				}
			}
		});
	}
});

test("range endpoint reuse preserves NaN rejection and input errors", () => {
	for (const spec of [{ kind: "number" }, { kind: "bytes" }, { kind: "number", negativeDisplay: "parentheses" }]) {
		const compiled = formatter.compile(spec);
		for (const method of ["formatRange", "formatRangeToParts"]) {
			for (const run of [
				(left, right) => formatter[method](left, right, spec),
				(left, right) => compiled[method](left, right),
			]) {
				for (const pair of [["NaN", "1"], ["1", "NaN"]]) {
					let reads = 0;
					const values = pair.map(value => ({ toValue() { reads++; return value; } }));
					assert.throws(() => run(...values), /cannot contain NaN/);
					assert.equal(reads, 2);
				}
				const failure = new Error("endpoint failure");
				const invalid = { toValue() { throw failure; } };
				assert.throws(() => run(invalid, "1"), error => error === failure);
				assert.throws(() => run("1", invalid), error => error === failure);
			}
		}
	}
});

test("left and right columns use the string fast path for direct and compiled calls", () => {
	for (const spec of [{ kind: "number", maximumFractionDigits: 2 }, { kind: "bytes" }]) {
		const compiled = formatter.compile(spec);
		const values = [1, 1200, 1536];
		const strings = compiled.formatSeries(values);
		const width = Math.max(...strings.map(value => Array.from(value).length));
		countNumberParts(getCalls => {
			for (const align of ["left", "right"]) {
				const expected = strings.map(value => {
					const padding = "🟦".repeat(width - Array.from(value).length);
					return align === "left" ? value + padding : padding + value;
				});
				assert.deepEqual(formatter.formatColumn(values, spec, { align, fill: "🟦" }), expected);
				assert.deepEqual(compiled.formatColumn(values, { align, fill: "🟦" }), expected);
			}
			assert.equal(getCalls(), 0);
			compiled.formatColumn(values); // Decimal alignment still needs semantic parts.
			assert.equal(getCalls(), values.length);
		});
	}
});

test("column fast paths preserve custom series precedence and validate before rendering", () => {
	let renders = 0;
	const custom = new Formatter({ codecs: [{
		kind: "text",
		format: () => assert.fail("parts are unnecessary"),
		formatString: value => { renders++; return value; },
	}] });
	const spec = { kind: "text" };
	const compiled = custom.compile(spec);
	assert.deepEqual(custom.formatColumn(["😀", "ab"], spec, { align: "right" }), [" 😀", "ab"]);
	assert.deepEqual(compiled.formatColumn(["😀", "ab"], { align: "left" }), ["😀 ", "ab"]);
	const before = renders;
	for (const values of [[], ["unused"]]) for (const options of [
		{ align: "invalid" }, { align: "left", fill: "" }, { align: "right", fill: "ab" },
		{ align: "left", scale: "invalid" }, { align: "decimal", scale: "invalid" },
	]) {
		assert.throws(() => custom.formatColumn(values, spec, options), RangeError);
		assert.throws(() => compiled.formatColumn(values, options), RangeError);
	}
	assert.equal(renders, before);
	const series = new Formatter({ codecs: [{
		kind: "series", format: () => assert.fail("use series"), formatString: () => assert.fail("use series"),
		formatSeries: () => [[{ type: "literal", value: "x" }], [{ type: "literal", value: "wide" }]],
	}] });
	assert.deepEqual(series.formatColumn([1, 2], { kind: "series" }, { align: "right" }), ["   x", "wide"]);
	assert.deepEqual(series.compile({ kind: "series" }).formatColumn([1, 2], { align: "left" }), ["x   ", "wide"]);
});

test("string-only numeric series avoid Intl token rendering", () => {
	for (const spec of [{ kind: "number", maximumFractionDigits: 2 }, { kind: "bytes" }]) {
		const compiled = formatter.compile(spec);
		const expected = compiled.formatSeriesToParts([1200, 1536, 2048]).map(renderTokens);
		countNumberParts(getCalls => {
			assert.deepEqual(compiled.formatSeries([1200, 1536, 2048]), expected);
			assert.equal(getCalls(), 0);
		});
		assert.throws(() => compiled.formatSeries([], { scale: "invalid" }), RangeError);
	}
});

test("shared-scale series read structural numeric inputs once for strings and parts", () => {
	for (const spec of [{ kind: "bytes" }, { kind: "number", notation: "compact" }]) {
		for (const method of ["formatSeries", "formatSeriesToParts"]) {
			let reads = 0;
			const values = [1200, 1600].map(value => ({ toValue: () => { reads++; return String(value); } }));
			const compiled = formatter.compile(spec);
			assert.deepEqual(compiled[method](values), compiled[method]([1200, 1600]));
			assert.equal(reads, 2);
		}
	}
});

test("common detailed formats render once without parser revalidation", () => {
	for (const spec of [{ kind: "number", maximumFractionDigits: 2 }, { kind: "bytes" }]) {
		const compiled = formatter.compile(spec);
		compiled.formatDetailed(1234.567); // Warm locale digits, independent of parse profiles.
		let reads = 0;
		countNumberParts(getCalls => {
			const result = compiled.formatDetailed({ toValue: () => { reads++; return "2345.678"; } });
			assert.equal(renderTokens(result.parts), result.text);
			assert.equal(getCalls(), 1);
			assert.equal(reads, 1);
		});
	}
});

test("custom string and series hooks and metadata failures retain precedence", () => {
	const custom = new Formatter({ codecs: [{
		kind: "fast", format: () => assert.fail("parts are unnecessary"), formatString: value => String(value),
	}] });
	assert.deepEqual(custom.formatSeries([1, 2], { kind: "fast" }), ["1", "2"]);
	const shared = new Formatter({ codecs: [{
		kind: "shared", format: () => [], formatString: () => assert.fail("must use custom series"),
		formatSeries: () => [[{ type: "literal", value: "shared output" }]],
	}] });
	assert.deepEqual(shared.formatSeries([1, 2], { kind: "shared" }), ["shared output"]);
	// Separate codec objects do not inherit private built-in execution paths.
	const failure = new Error("metadata failed");
	const numbers = new Formatter({ codecs: [{ ...numberCodec, formatDetailed() { throw failure; } }] });
	assert.throws(() => numbers.compile({ kind: "number" }).formatDetailed(1), error => error === failure);
	const bytes = new Formatter({ codecs: [{
		...bytesCodec, formatSeries: () => [[{ type: "literal", value: "override" }]],
	}] }).compile({ kind: "bytes" });
	assert.deepEqual(bytes.formatSeries([1024]), ["override"]);
});
