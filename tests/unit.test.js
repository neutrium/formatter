import { parser, createParser } from "@neutrium/formatter/parse";
import test from "node:test";
import { compactUnitLocales } from "./fixtures/intl-cases.js";
import assert from "node:assert/strict";
import { formatter as builtInFormatter, createFormatter, renderTokens, formatter } from "@neutrium/formatter";

test("delegates localized unit presentation and pluralization to Intl", () => {
	const spec = { kind: "unit", unit: "kilometer-per-hour", unitDisplay: "long" };
	assert.equal(builtInFormatter.format(1, spec), "1 kilometer per hour");
	assert.equal(builtInFormatter.format(12.5, spec), "12.5 kilometers per hour");
	assert.equal(parser.parse("12.5 kilometers per hour", spec), "12.5");

	const german = createFormatter({ locale: "de-DE" });
	const germanSpec = { kind: "unit", unit: "kilometer-per-hour", unitDisplay: "long" };
	const expected = new Intl.NumberFormat("de-DE", {
		style: "unit",
		unit: "kilometer-per-hour",
		unitDisplay: "long",
	}).format(12.5);
	assert.equal(german.format(12.5, germanSpec), expected);
	assert.equal(createParser({ locale: "de-DE" }).parse(expected, germanSpec), "12.5");

	for (const [locale, value] of [["ar-EG", 3], ["br-FR", 1_000_000]])
	{
		const formatter = createFormatter({ locale });
		const localizedSpec = { kind: "unit", unit: "meter", unitDisplay: "long" };
		const rendered = formatter.format(value, localizedSpec);
		assert.equal(createParser({ locale }).parse(rendered, localizedSpec), String(value));
	}
});

test("retains exact numeric inputs and semantic unit parts", () => {
	const spec = { kind: "unit", unit: "meter", maximumFractionDigits: 2 };
	assert.equal(
		builtInFormatter.format("9007199254740993.25", spec),
		"9,007,199,254,740,993.25 m",
	);
	const parts = builtInFormatter.formatToParts(12.5, spec);
	assert.equal(renderTokens(parts), "12.5 m");
	assert.deepEqual(parts.at(-1), { type: "unit", value: "m" });
});

test("supports unit overrides and general negative parentheses", () => {
	const overridden = { kind: "unit", unit: "meter", unitSymbol: "metres" };
	assert.equal(builtInFormatter.format(12.5, overridden), "12.5 metres");
	assert.equal(parser.parse("12.5 metres", overridden), "12.5");
	assert.throws(() => parser.parse("12.5 m", overridden), /Invalid formatted unit/);

	const parenthesized = { kind: "unit", unit: "meter", negativeDisplay: "parentheses" };
	assert.equal(builtInFormatter.format(-12.5, parenthesized), "(12.5 m)");
	assert.equal(parser.parse("(12.5 m)", parenthesized), "-12.5");
});

test("uses native Intl unit ranges and shared source metadata", () => {
	const spec = { kind: "unit", unit: "kilometer-per-hour", unitDisplay: "long" };
	const native = new Intl.NumberFormat("en-US", {
		style: "unit",
		unit: "kilometer-per-hour",
		unitDisplay: "long",
	});
	assert.equal(builtInFormatter.formatRange(1, 2, spec), native.formatRange(1, 2));
	const parts = builtInFormatter.formatRangeToParts(1, 2, spec);
	assert.equal(renderTokens(parts), native.formatRange(1, 2));
	assert.ok(parts.some((part) => part.type === "unit" && part.source === "shared"));
});

test("supports compact unit scales across series and columns", () => {
	const spec = {
		kind: "unit",
		unit: "meter",
		notation: "compact",
		maximumFractionDigits: 1,
	};
	assert.equal(builtInFormatter.format(1_200_000, spec), "1.2M m");
	assert.equal(parser.parse("1.2M m", spec), "1200000");
	assert.deepEqual(builtInFormatter.formatSeries([1_200, 1_200_000], spec), ["0M m", "1.2M m"]);
	assert.deepEqual(
		builtInFormatter.formatSeries([1_200, 1_200_000], spec, { scale: "individual" }),
		["1.2K m", "1.2M m"],
	);
	assert.deepEqual(
		builtInFormatter.formatColumn([1.2, 12], { kind: "unit", unit: "meter", maximumFractionDigits: 1 }),
		["   1.2 m", "12 m    "],
	);

	const fixed = { kind: "unit", unit: "meter", compactExponent: 6, maximumFractionDigits: 2 };
	assert.equal(builtInFormatter.format(1_234_567, fixed), "1.23M m");
	assert.equal(parser.parse("1.23M m", fixed), "1230000");
});

test("compiled unit formatters expose the full numeric API", () => {
	const formatter = builtInFormatter.compile({ kind: "unit", unit: "meter", unitDisplay: "long" });
	assert.equal(formatter.format(2), "2 meters");
	assert.equal(parser.compile(formatter.spec).parse("2 meters"), "2");
	assert.equal(formatter.formatRange(1, 2), "1–2 meters");
	assert.deepEqual(formatter.formatSeries([1, 2]), ["1 meter", "2 meters"]);
});

test("lets Intl reject unsupported unit identifiers", () => {
	assert.throws(
		() => builtInFormatter.format(1, { kind: "unit", unit: "furlong-per-fortnight" }),
		RangeError,
	);
});

test("rounded compact unit names retain fractional grammar for both signs", () => {
	for (const locale of compactUnitLocales) {
		const spec = { kind: "unit", unit: "meter", unitDisplay: "long", locale,
			notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 };
		for (const value of [1999.9, -1999.9, 2999.9, -2999.9]) {
			const detailed = formatter.formatDetailed(value, spec);
			const compiled = createParser().compile(spec);
			assert.equal(compiled.parse(detailed.text), detailed.roundedValue, `${locale}: ${detailed.text}`);
			assert.equal(compiled.parse(detailed.text), detailed.roundedValue);
		}
	}
	const parser = createParser().compile({ kind: "unit", unit: "meter", unitDisplay: "long", locale: "ru",
		notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 });
	assert.throws(() => parser.parse("2 тысяч метра"), TypeError);
});

test("numeral-free unit presentations retain their rounded singular and dual values", () => {
	for (const precision of [{}, { maximumFractionDigits: 0 }, { maximumFractionDigits: 0, roundingMode: "floor" }]) {
		const spec = { kind: "unit", unit: "meter", locale: "ar", ...precision };
		const compiled = formatter.compile(spec);
		const parse = parser.compile(spec);
		for (const input of [1, 2, 1.1, 2.1, -1, -2, -2.1]) {
			const detail = compiled.formatDetailed(input);
			const numeric = formatter.formatDetailed(input, { kind: "number", locale: "ar", ...precision });
			// Native singular/dual patterns also omit the sign: their output is positive.
			const expected = detail.parts.some(part => part.type === "sign") ? numeric.roundedValue : numeric.roundedValue.replace(/^-/, "");
			assert.equal(detail.roundedValue, expected);
			assert.equal(parse.parse(detail.text), expected);
		}
	}
	const spec = { kind: "unit", unit: "meter", locale: "ar", maximumFractionDigits: 0 };
	assert.equal(formatter.formatDetailed(2.1, spec).roundedValue, "2");
	assert.equal(parser.parse("متران", spec), "2");
	assert.equal(parser.parse("متر", spec), "1");
});

test("rounded unit grammatical variants round-trip without accepting invented presentations", () => {
	for (const precision of [{}, { maximumFractionDigits: 0, roundingIncrement: 5 }]) {
		const spec = { kind: "unit", unit: "meter", locale: "ar", notation: "compact", ...precision };
		const compiled = formatter.compile(spec);
		const parse = parser.compile(spec);
		for (const input of [999999, -999999, 12345, 1234567, 23456789, 234567890, -2345678, "999999999999999999999999"]) {
			const detail = compiled.formatDetailed(input);
			assert.equal(parse.parse(detail.text), detail.roundedValue, `${input}: ${detail.text}`);
			assert.equal(parser.parse(detail.text, spec), detail.roundedValue);
			assert.equal(parse.parse(` \t${detail.text}\n`), detail.roundedValue);
			for (const invalid of [detail.text + "junk", "00" + detail.text, detail.text.replace("متر", "ثانية")])
				assert.throws(() => parse.parse(invalid), TypeError, invalid);
		}
	}
	const spec = { kind: "unit", unit: "meter", locale: "sl", unitDisplay: "long", maximumFractionDigits: 0 };
	assert.equal(parser.parse(formatter.format(3, spec), spec), "3");
	assert.throws(() => parser.parse("3 metra", spec), TypeError);
});
