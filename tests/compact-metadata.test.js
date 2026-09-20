import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";

test("numeral-free compact output retains its scale in detailed metadata", () => {
	for (const locale of ["fr", "it"]) {
		const spec = { kind: "number", notation: "compact", compactDisplay: "long", locale };
		for (const value of [1000, -1000]) {
			for (const result of [formatter.formatDetailed(value, spec), formatter.compile(spec).formatDetailed(value),
				formatter.compileSeries([value], spec).formatDetailed(value)]) {
				if (value > 0) assert.equal(result.text, "mille");
				else assert.equal(result.text, formatter.format(value, spec));
				assert.equal(result.roundedValue, String(value));
				assert.deepEqual(result.scale, { kind: "decimal", exponent: 3 });
				// Returned metadata must not be a mutable reference into the parse cache.
				result.scale.exponent = 99;
			}
			assert.deepEqual(formatter.formatDetailed(value, spec).scale, { kind: "decimal", exponent: 3 });
		}
		assert.deepEqual(formatter.formatDetailed(0, spec).scale, { kind: "decimal", exponent: 0 });
	}
});

test("detailed compact metadata follows native rounded coefficients and plural forms", () => {
	for (const locale of ["ru", "pl", "cs", "sk", "ar", "fr", "pt"]) {
		for (const precision of [{}, { maximumFractionDigits: 0 }, { maximumSignificantDigits: 1 }]) {
			const spec = { kind: "number", locale, notation: "compact", compactDisplay: "long", ...precision };
			const format = formatter.compile(spec);
			const parse = parser.compile(spec);
			for (const value of [999.5, 9999, 99999, 999999, -999999, "1e30"]) {
				const detail = format.formatDetailed(value);
				assert.equal(detail.text, format.format(value));
				assert.equal(detail.roundedValue, parse.parse(detail.text), JSON.stringify({ value, spec }));
				assert.deepEqual(formatter.formatDetailed(value, spec), detail);
			}
		}
	}
	const arabicUnit = { kind: "unit", unit: "meter", locale: "ar", notation: "compact" };
	assert.equal(formatter.formatDetailed(1200000, arabicUnit).roundedValue, "1200000");
	for (const kind of ["number", "currency", "unit"]) {
		const spec = { kind, locale: "ru", notation: "compact", ...(kind === "currency" ? { currency: "USD" } :
			kind === "unit" ? { unit: "meter" } : {}), negativeDisplay: "parentheses" };
		let reads = 0;
		const detail = formatter.formatDetailed({ toValue() { reads++; return "-999999"; } }, spec);
		assert.equal(reads, 1);
		assert.equal(detail.roundedValue, "-1000000");
		assert.deepEqual(detail.scale, { kind: "decimal", exponent: 6 });
	}
});

test("compact increments recover the displayed scale independently of source magnitude", () => {
	for (const [roundingIncrement, roundingMode, text, value, exponent] of [
		[100, "ceil", "100K", "100000", 3],
		[5, "halfExpand", "0K", "0", 3],
		[5000, "ceil", "5000M", "5000000000", 6],
	]) {
		const spec = { kind: "number", notation: "compact", maximumFractionDigits: 0, roundingIncrement, roundingMode };
		const compiled = formatter.compile(spec);
		const detail = compiled.formatDetailed(1000);
		assert.equal(detail.text, text);
		assert.equal(detail.roundedValue, value);
		assert.deepEqual(detail.scale, { kind: "decimal", exponent });
		assert.deepEqual(formatter.formatDetailed(1000, spec), detail);
		assert.equal(parser.parse(text, spec), value);
		assert.equal(parser.compile(spec).parse(text), value);
	}
	for (const locale of ["en-US", "ar-EG", "fr-FR"]) {
		for (const roundingIncrement of [5, 10, 25, 50, 100, 250, 500, 1000, 5000]) {
			for (const roundingMode of ["ceil", "floor", "halfExpand"]) {
				const spec = { kind: "number", locale, notation: "compact", maximumFractionDigits: 0, roundingIncrement, roundingMode };
				const compiled = formatter.compile(spec);
				const parse = parser.compile(spec);
				for (const input of [1000, -1000, 999999, -999999]) {
					const detail = compiled.formatDetailed(input);
					assert.equal(detail.text, compiled.format(input));
					assert.equal(parse.parse(detail.text), detail.roundedValue, JSON.stringify({ input, spec }));
				}
			}
		}
	}
});
