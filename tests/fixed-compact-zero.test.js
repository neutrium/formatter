import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";

test("fixed compact zero retains native grammar with padded decimal places", () => {
	for (const locale of ["lv", "ru", "pl", "fr", "ar", "cs"]) {
		for (const digits of [0, 1, 2, 3]) {
			for (const trailingZeroDisplay of ["auto", "stripIfInteger"]) {
				const options = { notation: "compact", compactDisplay: "long", minimumFractionDigits: digits,
					maximumFractionDigits: digits, roundingIncrement: 5000, roundingMode: "trunc", trailingZeroDisplay };
				const native = new Intl.NumberFormat(locale, options);
				const spec = { kind: "number", locale, ...options, compactExponent: 3 };
				const compiled = formatter.compile(spec);
				const parse = parser.compile(spec);
				for (const input of [1000, -1000, 0, -0]) {
					const negative = input < 0 || Object.is(input, -0);
					// Start native Intl within the magnitude and truncate to signed zero.
					const expected = native.format(negative ? -1000 : 1000);
					const detail = compiled.formatDetailed(input);
					assert.equal(detail.text, expected, JSON.stringify({ locale, digits, trailingZeroDisplay, input }));
					assert.equal(formatter.format(input, spec), expected);
					assert.equal(compiled.format(input), expected);
					assert.equal(renderTokens(compiled.formatToParts(input)), expected);
					assert.equal(detail.roundedValue, negative ? "-0" : "0");
					assert.deepEqual(detail.scale, { kind: "decimal", exponent: 3 });
					assert.equal(parse.parse(expected), detail.roundedValue);
				}
			}
		}
	}
});

test("padded compact zero grammar is reusable in shared scales and display overrides", () => {
	const spec = { kind: "number", locale: "lv", notation: "compact", compactDisplay: "long",
		minimumFractionDigits: 2, maximumFractionDigits: 2, roundingIncrement: 5000, roundingMode: "trunc" };
	const values = [1000, 50000, -1000, 0];
	const shared = formatter.compileSeries(values, spec);
	const expected = ["0,00 tūkstošu", "50,00 tūkstoši", "-0,00 tūkstošu", "0,00 tūkstošu"];
	assert.deepEqual(shared.formatSeries(values), expected);
	assert.deepEqual(formatter.formatSeries(values, spec), expected);
	assert.deepEqual(shared.formatSeries([...values].reverse()), [...expected].reverse());
	for (const options of [{ signDisplay: "always" }, { negativeDisplay: "parentheses" },
		{ minimumIntegerDigits: 2 }, { zeroDisplay: "—" }]) {
		const selected = { ...shared.spec, ...options };
		const detail = formatter.formatDetailed(-1000, selected);
		assert.equal(parser.parse(detail.text, selected), detail.roundedValue);
		if (options.zeroDisplay) assert.equal(detail.text, "—");
		else assert.ok(detail.text.endsWith(options.negativeDisplay ? "tūkstošu)" : "tūkstošu"));
	}
});
