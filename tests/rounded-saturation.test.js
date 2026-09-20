import { countNumberParts } from "./helpers/intl-probes.js";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { multiplyPowerOfTwo, parseQuantity } from "../dist/numeric/shared/decimal-string.js";
import { assertScalarResult } from "./helpers/format-contract.js";

function check(input, normalized, spec) {
	const compiled = formatter.compile(spec);
	const expected = compiled.formatDetailed(normalized);
	const diagnostic = JSON.stringify({ input, normalized: String(normalized), spec });
	assertScalarResult(input, spec, expected, compiled);
	assert.equal(parser.parse(expected.text, spec), expected.roundedValue, diagnostic);
	assert.equal(compiled.format(expected.roundedValue), expected.text, diagnostic);
	assert.equal(compiled.formatRange(input, 10), compiled.formatRange(normalized, 10), diagnostic);
	assert.deepEqual(formatter.formatRangeToParts(input, 10, spec), compiled.formatRangeToParts(normalized, 10), diagnostic);
}

test("post-rounding overflow consistently uses explicit infinity across numeric domains", () => {
	for (const locale of ["en-US", "ar-EG", "fr-FR"]) for (const domain of [
		{ kind: "number" }, { kind: "number", notation: "scientific" }, { kind: "number", notation: "engineering" },
		{ kind: "number", notation: "compact" }, { kind: "number", compactExponent: 3 },
		{ kind: "currency", currency: "USD", currencySign: "accounting" },
		{ kind: "unit", unit: "meter", compactExponent: 3 },
		{ kind: "bytes" }, { kind: "bytes", byteBase: 1000 }, { kind: "percentage" },
		{ kind: "ordinal", ordinalFallback: "number" },
	]) for (const options of [{}, { negativeDisplay: "parentheses" }, { signDisplay: "never" },
		{ signDisplay: "always", infinityDisplay: "unbounded", zeroDisplay: "—" }]) {
		const spec = { ...domain, locale, maximumSignificantDigits: 2, ...options };
		check("1.797e308", Infinity, spec);
		check("-1.797e308", -Infinity, spec);
	}
});

test("post-rounding underflow consistently uses signed zero and whole-output placeholders", () => {
	for (const locale of ["en-US", "ar-EG", "fr-FR"]) for (const domain of [
		{ kind: "number" }, { kind: "number", notation: "scientific" }, { kind: "number", notation: "engineering" },
		{ kind: "currency", currency: "USD", currencySign: "accounting" }, { kind: "percentage" },
		{ kind: "unit", unit: "meter" }, { kind: "bytes" }, { kind: "ordinal", ordinalFallback: "number" },
	]) for (const options of [{}, { negativeDisplay: "parentheses" }, { signDisplay: "negative" },
		{ signDisplay: "exceptZero" }, { signDisplay: "always", zeroDisplay: "—" }]) {
		const spec = { ...domain, locale, maximumSignificantDigits: 1, roundingMode: "trunc", ...options };
		check("2.6e-324", 0, spec);
		check("-2.6e-324", -0, spec);
	}
});

test("scaled coefficients saturate even when reconstructed domain values remain in range", () => {
	const binaryInput = multiplyPowerOfTwo(parseQuantity("2.6e-324"), 80).toFixed();
	for (const [input, domain] of [
		["2.6e-321", { kind: "number", compactExponent: 3 }],
		[binaryInput, { kind: "bytes", byteExponent: 8 }],
		["2.6e-300", { kind: "bytes", byteBase: 1000, byteExponent: 8 }],
		["2.6e-322", { kind: "percentage", percentageScale: 1 }],
	]) {
		const spec = { ...domain, maximumSignificantDigits: 1, roundingMode: "trunc" };
		check(input, 0, spec);
		check(`-${input}`, -0, { ...spec, zeroDisplay: "zero" });
	}
	check("1.79e295", Infinity, { kind: "percentage", percentageScale: 1e15,
		maximumSignificantDigits: 1, infinityDisplay: "unbounded" });
});

test("series, selected scales, and columns use saturated rounded output", () => {
	for (const domain of [{ kind: "number", notation: "scientific" }, { kind: "number", notation: "compact" }, { kind: "bytes" }]) {
		const spec = { ...domain, maximumSignificantDigits: 2, zeroDisplay: "—", infinityDisplay: "unbounded" };
		const values = ["1.797e308", "-1.797e308", "0"];
		const compiled = formatter.compile(spec);
		const selected = formatter.compileSeries(values, spec);
		const expected = [Infinity, -Infinity, 0].map(value => selected.format(value));
		assert.deepEqual(compiled.formatSeries(values), expected);
		assert.deepEqual(formatter.formatSeries(values, spec), expected);
		assert.deepEqual(compiled.formatSeriesToParts(values).map(renderTokens), expected);
		assert.deepEqual(selected.formatSeries(values), expected);
		for (const align of ["left", "right", "decimal"]) {
			assert.deepEqual(compiled.formatColumn(values, { align }).map(cell => cell.trim()), expected);
		}
		assert.equal(selected.formatDetailed(values[0]).roundedValue, "Infinity");
	}
});

test("in-range boundary rounding and the ordinary string fast path remain unchanged", () => {
	const spec = { kind: "number", notation: "scientific", maximumSignificantDigits: 1 };
	for (const [input, options, expected] of [
		["1.79e308", { roundingMode: "trunc" }, "1E308"],
		["-1.79e308", { roundingMode: "ceil" }, "-1E308"],
		["2.6e-324", { roundingMode: "ceil" }, "3E-324"],
		["-2.6e-324", { roundingMode: "floor" }, "-3E-324"],
	]) {
		const compiled = formatter.compile({ ...spec, ...options });
		const detail = compiled.formatDetailed(input);
		assert.equal(detail.text, expected);
		assert.equal(parser.parse(detail.text, compiled.spec), detail.roundedValue);
		assert.equal(compiled.format(detail.roundedValue), expected);
	}
	const compiled = formatter.compile({ kind: "number", maximumFractionDigits: 2 });
	countNumberParts(getCalls => {
		assert.equal(compiled.format("12.345"), "12.35");
		assert.deepEqual(compiled.formatSeries([1, 2, 3]), ["1", "2", "3"]);
		assert.equal(getCalls(), 0);
	});
	for (const input of ["1.79e308", "2.6e-324"]) {
		let reads = 0;
		formatter.formatDetailed({ toValue() { reads++; return input; } }, spec);
		assert.equal(reads, 1);
	}
});
