import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { normalizeNumericRange, parseQuantity } from "../dist/numeric/shared/decimal-string.js";
import { assertScalarResult } from "./helpers/format-contract.js";

import { numericExtremes as extremes } from "./fixtures/intl-cases.js";

test("overflow and underflow behave like explicit infinity and zero across numeric presentations", () => {
	for (const locale of ["en-US", "ar-EG", "fr-FR"]) for (const domain of [
		{ kind: "number" }, { kind: "number", notation: "scientific" },
		{ kind: "number", notation: "engineering" }, { kind: "number", notation: "compact" },
		{ kind: "number", compactExponent: 3 }, { kind: "currency", currency: "USD", currencySign: "accounting" },
		{ kind: "currency", currency: "USD", compactExponent: 3 },
		{ kind: "percentage" }, { kind: "unit", unit: "meter" },
		{ kind: "bytes" }, { kind: "bytes", byteBase: 1000, byteExponent: 2 },
		{ kind: "ordinal", ordinalFallback: "number" },
	]) for (const options of [{}, { negativeDisplay: "parentheses" }, { signDisplay: "never" },
		{ signDisplay: "always", zeroDisplay: "—", infinityDisplay: "unbounded" }]) {
		const spec = { ...domain, locale, ...options };
		const compiled = formatter.compile(spec);
		for (const [input, normalized] of extremes) {
			const expected = compiled.formatDetailed(normalized);
			assertScalarResult(input, spec, expected, compiled);
			assert.equal(parser.parse(expected.text, spec), expected.roundedValue);
		}
	}
});

test("series normalize extremes before selecting shared scales and preserve range endpoint semantics", () => {
	const values = ["1e400", "-1e400", "1e-400", "-1e-400", "1200"];
	const normalized = [Infinity, -Infinity, 0, -0, "1200"];
	for (const domain of [{ kind: "number", notation: "compact" }, { kind: "bytes" },
		{ kind: "currency", currency: "USD" }, { kind: "percentage", percentageScale: 10000 }]) {
		for (const options of [{}, { infinityDisplay: "unbounded", zeroDisplay: "—", negativeDisplay: "parentheses" }]) {
			const spec = { ...domain, ...options };
			const compiled = formatter.compile(spec);
			const selected = formatter.compileSeries(values, spec);
			assert.deepEqual(selected.spec, formatter.compileSeries(normalized, spec).spec);
			assert.deepEqual(formatter.formatSeries(values, spec), formatter.formatSeries(normalized, spec));
			assert.deepEqual(compiled.formatSeries(values), compiled.formatSeries(normalized));
			assert.deepEqual(compiled.formatSeriesToParts(values), compiled.formatSeriesToParts(normalized));
			assert.deepEqual(selected.formatSeries(values), selected.formatSeries(normalized));
			assert.deepEqual(compiled.formatColumn(values), compiled.formatColumn(normalized));
			for (const [input, normal] of extremes) {
				assert.equal(formatter.formatRange(input, 1200, spec), formatter.formatRange(normal, 1200, spec));
				assert.equal(compiled.formatRange(input, 1200), compiled.formatRange(normal, 1200));
				assert.deepEqual(compiled.formatRangeToParts(input, 1200), compiled.formatRangeToParts(normal, 1200));
			}
		}
	}
});

test("range normalization preserves exact nonzero decimals and boundary behavior", () => {
	for (const value of ["9007199254740993.123456789", "1.7976931348623158e308", "3e-324", "-3e-324", "0.123456789123456789"]) {
		const quantity = parseQuantity(value);
		assert.strictEqual(normalizeNumericRange(quantity), quantity);
		assert.equal(normalizeNumericRange(quantity).toValue(), quantity.toValue());
	}
	for (const [input, expected] of [["1.7976931348623159e308", "Infinity"], ["-1.7976931348623159e308", "-Infinity"],
		["2e-324", "0"], ["-2e-324", "-0"]]) {
		assert.equal(normalizeNumericRange(parseQuantity(input)).toValue(), expected);
	}
	const scientific = { kind: "number", notation: "scientific", maximumFractionDigits: 9 };
	assert.equal(formatter.format("3e-324", scientific), "3E-324");
	assert.equal(formatter.format("2e-324", scientific), "0E0");
	assert.equal(formatter.format("9007199254740993.123456789", { kind: "number", useGrouping: false, maximumFractionDigits: 9 }),
		"9007199254740993.123456789");
});

test("scaled Intl operands normalize too without reading structural inputs twice", () => {
	const percent = { kind: "percentage", percentageScale: 10000, infinityDisplay: "unbounded" };
	assert.equal(formatter.format("1e308", percent), formatter.format(Infinity, percent));
	assert.equal(formatter.formatRange("1e308", "1e308", percent), formatter.formatRange(Infinity, Infinity, percent));
	for (const spec of [{ kind: "bytes", byteExponent: 8, maximumSignificantDigits: 5 },
		{ kind: "number", compactExponent: 3, maximumSignificantDigits: 5 }]) {
		assert.equal(formatter.format("3e-324", spec), formatter.format(0, spec));
		assert.equal(formatter.formatDetailed("3e-324", spec).roundedValue, "0");
	}
	for (const [input, normal] of extremes) {
		for (const method of ["format", "formatToParts", "formatDetailed"]) {
			let reads = 0;
			const result = formatter[method]({ toValue() { reads++; return input; } }, { kind: "number" });
			assert.equal(reads, 1);
			assert.deepEqual(result, formatter[method](normal, { kind: "number" }));
		}
	}
	const parts = formatter.formatToParts("1e400", { kind: "ordinal" });
	assert.equal(renderTokens(parts), "∞");
	assert.equal(parts.some(part => part.type === "ordinal"), false);
	// Exact duration arithmetic is not subject to numeric-presentation limits.
	assert.notEqual(formatter.format("1e309", { kind: "duration", presentation: "elapsed" }), "Infinity");
	assert.equal(formatter.format("1e100001", { kind: "number" }), "∞");
	assert.equal(formatter.format("-1e-100001", { kind: "number" }), "-0");
});

test("large Decimal exponents reach numeric saturation without a separate parser limit", () => {
	for (const [input, expected] of [
		["1e100001", "Infinity"], ["-1e100001", "-Infinity"],
		["1e-100001", "0"], ["-1e-100001", "-0"],
		["0x1p1024", "Infinity"], ["-0b1p-1075", "-0"],
	]) {
		const result = formatter.formatDetailed(input, { kind: "number" });
		assert.equal(result.roundedValue, expected);
		assert.equal(result.text, formatter.format(expected, { kind: "number" }), input);
	}
});
