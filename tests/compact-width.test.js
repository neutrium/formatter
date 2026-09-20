import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { countNumberParts } from "./helpers/intl-probes.js";

test("fixed compact patterns retain native width-sensitive grammar across domains and signs", () => {
	for (const domain of [
		{ kind: "number" },
		{ kind: "unit", unit: "meter", unitDisplay: "long" },
		{ kind: "currency", currency: "USD", currencyDisplay: "name" },
	]) {
		const { kind, ...options } = domain;
		const spec = { ...domain, locale: "ar", compactExponent: 3, compactDisplay: "long",
			minimumFractionDigits: 0, maximumFractionDigits: 1 };
		const native = new Intl.NumberFormat("ar", { ...options, style: kind === "number" ? "decimal" : kind,
			notation: "compact", compactDisplay: "long", minimumFractionDigits: 0, maximumFractionDigits: 1 });
		const compiled = formatter.compile(spec);
		const parsing = parser.compile(compiled.spec);
		// Alternate widths and reverse the order to expose cache contamination.
		const values = [3000, 10000, 23000, 103000, 10100, 100100];
		for (const value of [...values, ...values.toReversed()].flatMap(value => [value, -value])) {
			const expected = native.format(value);
			const detail = compiled.formatDetailed(value);
			assert.equal(detail.text, expected, `${kind}: ${value}`);
			assert.equal(renderTokens(compiled.formatToParts(value)), expected);
			assert.equal(formatter.format(value, spec), expected);
			assert.equal(parsing.parse(expected), detail.roundedValue);
			assert.equal(detail.scale.exponent, 3);
		}
		const expected = values.map(value => native.format(value));
		assert.deepEqual(compiled.formatSeries(values), expected);
		assert.deepEqual(compiled.formatColumn(values, { align: "left" }).map(value => value.trimEnd()), expected);
		assert.deepEqual(formatter.compileSeries(values, spec).formatSeries(values), expected);
	}
});

test("width is selected after rounding and does not count integer padding", () => {
	for (const options of [
		{ maximumFractionDigits: 0 },
		{ minimumIntegerDigits: 3, maximumFractionDigits: 0 },
		{ maximumSignificantDigits: 2 },
		{ roundingIncrement: 5, maximumFractionDigits: 0 },
	]) {
		const spec = { kind: "number", locale: "ar", compactExponent: 3, compactDisplay: "long", ...options };
		const native = new Intl.NumberFormat("ar", { notation: "compact", compactDisplay: "long", ...options });
		const compiled = formatter.compile(spec);
		for (const value of [3000, 9600, 103000, -9600]) assert.equal(compiled.format(value), native.format(value));
	}
});

test("width-aware grammar remains compatible with other locale patterns", () => {
	for (const locale of ["ru", "lv", "pl", "fr", "sw", "ja", "bn"]) {
		const exponent = locale === "ja" ? 4 : 3;
		const options = { notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 };
		const native = new Intl.NumberFormat(locale, options);
		const compiled = formatter.compile({ kind: "number", locale, compactExponent: exponent, ...options });
		const parsing = parser.compile(compiled.spec);
		const coefficients = locale === "bn" ? [3, 10.1, 23] : [3, 10.1, 23, 100.1, 103];
		for (const coefficient of coefficients) {
			const value = coefficient * 10 ** exponent;
			assert.equal(compiled.format(value), native.format(value), `${locale}: ${value}`);
			assert.equal(parsing.parse(compiled.format(value)), String(value));
		}
	}
});

test("fixed coefficients beyond the native magnitude retain its widest available pattern", () => {
	const spec = { kind: "number", locale: "ar", compactExponent: 3, compactDisplay: "long", maximumFractionDigits: 1 };
	const fixed = formatter.compile(spec);
	const parse = parser.compile(fixed.spec);
	for (const value of [1003000, 10003000, -1003000]) {
		const detail = fixed.formatDetailed(value);
		assert.equal(detail.parts.find(part => part.type === "unit").value, "ألف");
		assert.equal(detail.scale.exponent, 3);
		assert.equal(parse.parse(detail.text), String(value));
	}
	// Bengali changes scales after two coefficient digits, Japanese after four.
	for (const [locale, exponent, small, large] of [["bn", 3, 23000, 103000], ["ja", 4, 23000000, 103000000]]) {
		const compiled = formatter.compile({ ...spec, locale, compactExponent: exponent });
		assert.equal(compiled.formatToParts(small).find(part => part.type === "unit").value,
			compiled.formatToParts(large).find(part => part.type === "unit").value);
	}
});

test("warm width-specific compact patterns perform no discovery probes", () => {
	const fixed = formatter.compile({ kind: "number", locale: "ar", compactExponent: 3, compactDisplay: "long" });
	const values = [3000, 10000, 103000, 1003000];
	fixed.formatSeries(values);
	assert.equal(countNumberParts(() => fixed.formatSeries(values)), values.length);
});
