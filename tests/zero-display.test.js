import test from "node:test";
import assert from "node:assert/strict";
import { countNumberParts } from "./helpers/intl-probes.js";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser, createParser } from "@neutrium/formatter/parse";

test("zero placeholders replace the entire rounded presentation in every numeric domain", () => {
	for (const locale of ["en-US", "de-DE", "ar-EG", "fa", "bn", "zh-u-nu-hanidec"]) {
		for (const domain of [
			{ kind: "number" }, { kind: "currency", currency: "USD", currencySign: "accounting" },
			{ kind: "unit", unit: "meter", unitDisplay: "long" }, { kind: "percentage" },
			{ kind: "bytes", byteExponent: 1 }, { kind: "bytes", byteBase: 1000 },
			{ kind: "ordinal", ordinalFallback: "number" },
			{ kind: "number", compactExponent: locale === "de-DE" ? 6 : locale.startsWith("zh") ? 4 : 3 },
			{ kind: "number", notation: "compact", compactDisplay: "long" },
		]) for (const signDisplay of ["auto", "always", "never", "negative", "exceptZero"]) {
			const spec = { ...domain, locale, signDisplay, negativeDisplay: "parentheses",
				maximumFractionDigits: 2, zeroDisplay: "—" };
			const compiled = formatter.compile(spec);
			for (const value of [0, -0, "0.000001", "-0.000001"]) {
				assert.equal(formatter.format(value, spec), "—");
				assert.equal(compiled.format(value), "—");
				const detail = compiled.formatDetailed(value);
				assert.deepEqual(detail.parts, [{ type: "literal", value: "—" }]);
				assert.equal(detail.roundedValue, "0");
				assert.equal("scale" in detail, false);
				assert.deepEqual(formatter.formatDetailed(value, spec), detail);
				assert.deepEqual(formatter.formatToParts(value, spec), detail.parts);
			}
		}
	}
});

test("zero detection follows signed Intl rounding, notation, and displayed scale", () => {
	const base = { kind: "number", minimumFractionDigits: 2, maximumFractionDigits: 2, zeroDisplay: "—" };
	for (const [roundingMode, positive, negative] of [
		["ceil", "0.01", "—"], ["floor", "—", "-0.01"],
		["expand", "0.01", "-0.01"], ["trunc", "—", "—"],
		["halfEven", "—", "—"],
	]) {
		assert.equal(formatter.format("0.001", { ...base, roundingMode }), positive);
		assert.equal(formatter.format("-0.001", { ...base, roundingMode }), negative);
	}
	assert.equal(formatter.format("0.005", { ...base, roundingMode: "halfEven" }), "—");
	assert.equal(formatter.format("0.005", { ...base, roundingMode: "halfExpand" }), "0.01");
	for (const notation of ["scientific", "engineering"]) {
		const spec = { ...base, notation };
		assert.equal(formatter.format(-0, spec), "—");
		assert.equal(formatter.format("0.001", spec), formatter.format("0.001", { ...spec, zeroDisplay: undefined }));
	}
	assert.equal(formatter.format("1e-400", base), "—");
	for (const compactExponent of [undefined, 3]) {
		const spec = { kind: "number", notation: "compact", compactDisplay: "long", locale: "ru",
			compactExponent, maximumFractionDigits: 0, roundingIncrement: 5, roundingMode: "trunc", zeroDisplay: "—" };
		assert.equal(formatter.format(1000, spec), "—");
		assert.equal(formatter.formatDetailed(-1000, spec).scale, undefined);
	}
	const literal = { ...base, zeroDisplay: "(0K)", infinityDisplay: "(0K)", nanDisplay: "(0K)" };
	assert.equal(formatter.formatDetailed(NaN, literal).roundedValue, "NaN");
	assert.equal(formatter.formatDetailed(Infinity, literal).roundedValue, "Infinity");
	assert.equal(formatter.formatDetailed(-0, literal).roundedValue, "0");
});

test("series select scales before zero replacement and columns pad after replacement", () => {
	for (const domain of [{ kind: "number", notation: "compact" }, { kind: "bytes" }]) {
		const spec = { ...domain, maximumFractionDigits: 0, zeroDisplay: "—" };
		const values = [1, 2000];
		const selected = formatter.compileSeries(values, spec);
		const expected = ["—", selected.format(2000)];
		assert.deepEqual(formatter.formatSeries(values, spec), expected);
		assert.deepEqual(formatter.compile(spec).formatSeries(values), expected);
		assert.deepEqual(selected.formatSeries(values), expected);
		assert.deepEqual(formatter.formatSeriesToParts(values, spec).map(renderTokens), expected);
		assert.notEqual(formatter.formatSeries(values, spec, { scale: "individual" })[0], "—");
		for (const align of ["left", "right", "decimal"]) {
			const column = formatter.formatColumn(values, spec, { align });
			assert.deepEqual(column.map(cell => cell.trim()), expected);
			assert.deepEqual(selected.formatColumn(values, { align }), column);
		}
		assert.equal(selected.formatDetailed(1).scale, undefined);
	}
});

test("ranges use whole zero replacements with endpoint source metadata", () => {
	for (const domain of [{ kind: "number" }, { kind: "currency", currency: "USD", currencySign: "accounting" },
		{ kind: "unit", unit: "meter" }, { kind: "bytes" }, { kind: "number", compactExponent: 3 }]) {
		const spec = { ...domain, maximumFractionDigits: 2, zeroDisplay: "—" };
		const compiled = formatter.compile(spec);
		assert.equal(compiled.resolution.capabilities.rangeImplementation, "fallback");
		for (const [start, end] of [[-0.001, 2], [-0.001, 0.001], [1, 2]]) {
			const parts = formatter.formatRangeToParts(start, end, spec);
			assert.equal(renderTokens(parts.filter(part => part.source === "startRange")), compiled.format(start));
			assert.equal(renderTokens(parts.filter(part => part.source === "endRange")), compiled.format(end));
			assert.equal(formatter.formatRange(start, end, spec), renderTokens(parts));
			assert.deepEqual(compiled.formatRangeToParts(start, end), parts);
		}
	}
});

test("zero placeholders are simple parse aliases independent of numeric grammar and history", () => {
	for (const zeroDisplay of ["—", "", " \t", " 1K "]) {
		const spec = { kind: "number", notation: "compact", zeroDisplay };
		const compiled = createParser().compile(spec);
		for (const input of [zeroDisplay, zeroDisplay.trim(), `\n${zeroDisplay}\t`]) {
			assert.equal(compiled.parse(input), "0");
			assert.equal(parser.parse(input, spec), "0");
		}
		assert.equal(compiled.parse("2K"), "2000");
		assert.equal(compiled.parse(zeroDisplay), "0");
		assert.equal(formatter.format(-0, spec), zeroDisplay);
	}
	const spec = { kind: "currency", currency: "USD", zeroDisplay: "—" };
	assert.equal(parser.parse("$0.00", spec), "0");
	assert.equal(parser.parse("-$0.00", spec), "-0");
	assert.throws(() => formatter.format(0, { ...spec, maximumFractionDigits: -1 }), RangeError);
	assert.throws(() => parser.parse("—", { ...spec, maximumFractionDigits: -1 }), RangeError);
});

test("zero replacement reuses the rendered parts and reads structural numeric inputs once", () => {
	const compiled = formatter.compile({ kind: "number", maximumFractionDigits: 2, zeroDisplay: "—" });
	for (const method of ["format", "formatToParts", "formatDetailed"]) {
		let reads = 0;
		const calls = countNumberParts(() => {
			compiled[method]({ toValue() { reads++; return "-0.001"; } });
		});
		assert.equal(reads, 1, method);
		assert.equal(calls, 1, method);
	}
});

test("rounded zeros use whole-output placeholders while numeric parsing retains strict syntax", () => {
	for (const locale of ["en-US", "de-DE", "ar-EG"]) for (const options of [
		{ kind: "number" }, { kind: "currency", currency: "USD" }, { kind: "unit", unit: "meter" },
		{ kind: "percentage" }, { kind: "bytes" }, { kind: "bytes", byteExponent: 1 },
	]) for (const negativeDisplay of ["sign", "parentheses"]) {
		const spec = { ...options, locale, negativeDisplay, maximumFractionDigits: 2, zeroDisplay: "—" };
		const format = formatter.compile(spec);
		const parse = parser.compile(spec);
		for (const value of ["0", "-0", "0.000001", "-0.000001"]) {
			const text = format.format(value);
			assert.equal(text, "—");
			assert.equal(parse.parse(text), "0", JSON.stringify(spec));
			assert.equal(parser.parse(text, spec), parse.parse(text));
		}
	}
	const spec = { kind: "number", maximumFractionDigits: 2, zeroDisplay: "—" };
	for (const text of ["00", "0.000", "0,0", "0%", "--0", "0junk", "—0"])
		assert.throws(() => parser.parse(text, spec), TypeError, text);
	assert.equal(parser.parse(" \t0\n", spec), "0");
	assert.equal(parser.parse("0", { ...spec, nanDisplay: "0" }), "NaN");
});
