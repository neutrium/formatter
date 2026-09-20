import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";

test("fixed and shared compact formats preserve localized plural forms", () => {
	for (const locale of ["fr-FR", "ru-RU", "ar-EG"])
	{
		for (const exponent of [3, 6])
		{
			const spec = { kind: "number", locale, notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 };
			const native = new Intl.NumberFormat(locale, {
				notation: "compact", compactDisplay: "long", maximumFractionDigits: 1,
			});
			const values = [1, 1.2, 2, 5, 21, -1, -2].map((value) => value * 10 ** exponent);
			const expected = values.map((value) => native.format(value));
			const compiled = formatter.compile({ ...spec, compactExponent: exponent });
			assert.deepEqual(formatter.formatSeries(values, spec), expected);
			assert.deepEqual(compiled.formatSeries(values), expected);
			for (let index = 0; index < values.length; index++)
			{
				assert.equal(compiled.format(values[index]), expected[index]);
				assert.equal(renderTokens(compiled.formatToParts(values[index])), expected[index]);
				assert.equal(parser.compile(compiled.spec).parse(expected[index]), String(values[index]));
			}
		}
	}
});

test("fixed compact plurals follow rounded coefficients without changing magnitude", () => {
	const fixed = formatter.compile({
		kind: "number", locale: "ru-RU", compactDisplay: "long", compactExponent: 6,
		maximumFractionDigits: 0,
	});
	assert.equal(fixed.format(1_960_000), "2 миллиона");
	assert.equal(fixed.format(210_000_000), "210 миллионов");
	assert.equal(fixed.format(1_001_000_000), "1 001 миллион");
	assert.equal(fixed.format(100_000), "0 миллионов");
	const french = formatter.compile({ kind: "number", locale: "fr-FR", compactExponent: 3, compactDisplay: "long", maximumFractionDigits: 0 });
	assert.equal(french.format(1040), "mille");
	assert.equal(parser.compile(french.spec).parse("mille"), "1000");
	assert.throws(() => formatter.compile({ kind: "number", locale: "ru-RU", compactExponent: 4, compactDisplay: "long" }), /does not start a compact magnitude/);
});

test("fixed compact formatting preserves exact large-integer plural operands", () => {
	const fixed = formatter.compile({ kind: "number", locale: "ru-RU", compactExponent: 3, compactDisplay: "long", useGrouping: false });
	for (const [value, output] of [
		["9007199254741001000", "9007199254741001 тысяча"],
		["9007199254741002000", "9007199254741002 тысячи"],
		["9007199254741005000", "9007199254741005 тысяч"],
	])
	{
		assert.equal(fixed.format(value), output);
		assert.equal(parser.compile(fixed.spec).parse(output), value);
	}
});

test("large fractional compact coefficients retain their plural operands", () => {
	for (const [locale, suffix] of [["ru", "тысячи"], ["lv", "tūkstotis"]]) {
		const spec = { kind: "number", locale, compactExponent: 3, compactDisplay: "long",
			useGrouping: false, maximumFractionDigits: 1 };
		const fixed = formatter.compile(spec);
		const parse = parser.compile(spec);
		const values = ["9007199254741005100", "-9007199254741005100", "9007199254741009100"];
		const expected = [`9007199254741005,1 ${suffix}`, `-9007199254741005,1 ${suffix}`, `9007199254741009,1 ${suffix}`];
		assert.deepEqual(fixed.formatSeries(values), expected);
		assert.deepEqual(formatter.compileSeries(values, spec).formatSeries(values), expected);
		for (const [index, value] of values.entries()) {
			const detail = fixed.formatDetailed(value);
			assert.equal(detail.text, expected[index]);
			assert.equal(formatter.format(value, spec), expected[index]);
			assert.equal(renderTokens(fixed.formatToParts(value)), expected[index]);
			assert.equal(detail.roundedValue, value);
			assert.equal(parse.parse(expected[index]), value);
		}
	}
});

test("large compact fractions select plurals after configured rounding and padding", () => {
	for (const locale of ["ru", "lv", "pl"]) {
		for (const precision of [{ maximumFractionDigits: 2 },
			{ minimumFractionDigits: 2, maximumFractionDigits: 2 },
			{ minimumFractionDigits: 2, maximumFractionDigits: 2, roundingIncrement: 25 },
			{ maximumFractionDigits: 0 }]) {
			const spec = { kind: "number", locale, compactExponent: 3, compactDisplay: "long", ...precision };
			const fixed = formatter.compile(spec);
			for (const sign of ["", "-"]) {
				for (const fraction of ["100", "250", "010", "990", "000"]) {
					const large = `${sign}9007199254741005${fraction}`;
					const small = `${sign}5${fraction}`;
					const affix = parts => parts.filter(part => part.type === "unit");
					assert.deepEqual(affix(fixed.formatToParts(large)), affix(fixed.formatToParts(small)), JSON.stringify({ spec, large }));
					const detail = fixed.formatDetailed(large);
					assert.equal(parser.parse(detail.text, spec), detail.roundedValue);
				}
			}
		}
	}
});

test("compact currency and unit formats keep their surrounding semantic parts", () => {
	for (const domain of [{ kind: "currency", currency: "EUR" }, { kind: "unit", unit: "meter", unitDisplay: "long" }])
	{
		const spec = { ...domain, locale: "ru-RU", notation: "compact", compactDisplay: "long", minimumFractionDigits: 0, maximumFractionDigits: 1 };
		const fixed = formatter.compile({ ...spec, compactExponent: 6 });
		for (const value of [1_000_000, 2_000_000, 5_000_000])
		{
			const expected = formatter.format(value, spec);
			assert.equal(fixed.format(value), expected);
			assert.equal(parser.compile(fixed.spec).parse(expected), String(value));
		}
	}
});

test("fixed compact increments cannot change the displayed magnitude", () => {
	for (const domain of [{ kind: "number" }, { kind: "currency", currency: "USD" }, { kind: "unit", unit: "meter" }]) {
		for (const roundingIncrement of [5, 50, 500, 1000, 5000]) {
			for (const roundingMode of ["ceil", "floor", "halfExpand"]) {
				const spec = { ...domain, compactExponent: 3, maximumFractionDigits: 0, roundingIncrement, roundingMode };
				const compiled = formatter.compile(spec);
				const parse = parser.compile(spec);
				for (const input of [1000, -1000, 123000, 999999, 10000000]) {
					const detail = compiled.formatDetailed(input);
					assert.ok(detail.parts.some(part => part.type === "unit" && part.value === "K"), detail.text);
					assert.deepEqual(detail.scale, { kind: "decimal", exponent: 3 });
					assert.equal(parse.parse(detail.text), detail.roundedValue);
					assert.equal(compiled.format(input), detail.text);
					assert.equal(formatter.format(input, spec), detail.text);
				}
			}
		}
	}
	const spec = { kind: "number", compactExponent: 3, maximumFractionDigits: 0, roundingIncrement: 5000, roundingMode: "ceil" };
	const detail = formatter.formatDetailed(1000, spec);
	assert.equal(detail.text, "5,000K");
	assert.equal(detail.roundedValue, "5000000");
	assert.equal(parser.parse(detail.text, spec), "5000000");
	assert.equal(formatter.formatRange(1000, 2000, spec), "5,000K–5,000K");
});

test("fixed compact plural probes do not reapply rounding increments", () => {
	const spec = { kind: "number", locale: "ru", compactDisplay: "long", compactExponent: 3,
		maximumFractionDigits: 0, roundingIncrement: 5, roundingMode: "trunc" };
	const fixed = formatter.compile(spec);
	for (const [value, expected] of [[1000, "0 тысяч"], [5000, "5 тысяч"], [25000, "25 тысяч"], [-5000, "-5 тысяч"]]) {
		assert.equal(fixed.format(value), expected);
		assert.equal(formatter.format(value, spec), expected);
		assert.equal(renderTokens(fixed.formatToParts(value)), expected);
	}
	const sharedSpec = { ...spec, compactExponent: undefined, notation: "compact" };
	const values = [1000, 5000, 25000, -5000];
	const expected = values.map(value => fixed.format(value));
	assert.deepEqual(formatter.formatSeries(values, sharedSpec), expected);
	assert.deepEqual(formatter.compileSeries(values, sharedSpec).formatSeries(values), expected);
});

test("fixed compact increment plurals match native rounding for both signs and zero", () => {
	for (const locale of ["ru", "pl", "fr", "lv", "sl"]) {
		for (const roundingMode of ["trunc", "ceil", "floor", "halfExpand"]) {
			for (const [digits, roundingIncrement] of [[0, 5], [0, 25], [1, 5], [2, 25]]) {
				const options = { notation: "compact", compactDisplay: "long", minimumFractionDigits: digits,
					maximumFractionDigits: digits, roundingIncrement, roundingMode };
				const native = new Intl.NumberFormat(locale, options);
				const fixed = formatter.compile({ kind: "number", locale, ...options, compactExponent: 3 });
				const parse = parser.compile(fixed.spec);
				// Alternate zero/nonzero and signs to exercise cached affixes as well.
				for (const value of [1000, 5000, -1250, -5000, 1250, 25000, -2300, -25000, 1000]) {
					const detail = fixed.formatDetailed(value);
					assert.equal(detail.text, native.format(value), JSON.stringify({ locale, options, value }));
					assert.equal(fixed.format(value), detail.text);
					assert.equal(renderTokens(detail.parts), detail.text);
					assert.deepEqual(detail.scale, { kind: "decimal", exponent: 3 });
					assert.equal(parse.parse(detail.text), detail.roundedValue);
				}
			}
		}
	}
});

test("shared scale selection ignores rounding when validating locale magnitude boundaries", () => {
	for (const roundingIncrement of [50, 500, 1000, 5000]) {
		const spec = { kind: "number", notation: "compact", maximumFractionDigits: 0, roundingIncrement, roundingMode: "ceil" };
		for (const compactExponent of [4, 5]) {
			assert.equal(formatter.supports({ ...spec, compactExponent }), false);
			assert.throws(() => formatter.compile({ ...spec, compactExponent }), /does not start a compact magnitude/);
		}
		const values = [1000, 10000, 100000];
		const compiled = formatter.compileSeries(values, spec);
		assert.equal(compiled.spec.compactExponent, 3);
		assert.deepEqual(formatter.formatSeries(values, spec), compiled.formatSeries(values));
		assert.ok(compiled.formatSeries(values).every(text => text.endsWith("K")));
		assert.deepEqual(compiled.formatDetailed(10000000).scale, { kind: "decimal", exponent: 3 });
	}
	const japanese = { kind: "number", locale: "ja", notation: "compact", maximumFractionDigits: 0, roundingIncrement: 5000, roundingMode: "ceil" };
	assert.equal(formatter.supports({ ...japanese, compactExponent: 3 }), false);
	const compiled = formatter.compileSeries([10000, 20000], japanese);
	assert.equal(compiled.spec.compactExponent, 4);
	assert.equal(compiled.format(10000), "5,000万");
	assert.equal(parser.parse(compiled.format(10000), compiled.spec), "50000000");
});

test("Arabic compact units retain numerals, signs and reusable scales", () => {
	for (const locale of ["ar", "ar-EG"]) for (const compactExponent of [3, 6]) {
		const spec = { kind: "unit", unit: "meter", locale, notation: "compact" };
		const values = [1, 2, -1, -2, 5].map(value => value * 10 ** compactExponent);
		const expected = values.map(value => formatter.format(value, spec));
		const fixed = formatter.compile({ ...spec, compactExponent });
		assert.deepEqual(fixed.formatSeries(values), expected);
		assert.deepEqual(formatter.formatSeries(values, spec), expected);
		const shared = formatter.compileSeries(values, spec);
		assert.equal(shared.spec.compactExponent, compactExponent);
		for (const [index, value] of values.entries()) {
			const detail = fixed.formatDetailed(value);
			assert.equal(detail.text, expected[index]);
			assert.equal(detail.roundedValue, String(value));
			assert.equal(parser.parse(detail.text, fixed.spec), String(value));
			assert.equal(shared.format(value), detail.text);
		}
		const overridden = formatter.compile({ ...spec, compactExponent, unitSymbol: "m", negativeDisplay: "parentheses" });
		const detail = overridden.formatDetailed(values[2]);
		assert.ok(detail.text.startsWith("("));
		assert.ok(detail.text.endsWith("m)"));
		assert.equal(detail.roundedValue, String(values[2]));
		assert.equal(parser.parse(detail.text, overridden.spec), String(values[2]));
	}
});
