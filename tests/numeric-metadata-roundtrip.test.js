import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";
import { createParser } from "@neutrium/formatter/parse";

// Correctness matrices reuse a parser per spec. Cold discovery is tested separately
// in parser-initialization.test.js, not repeated for every value in these matrices.
test("trusted-part metadata matches strict parsing across signs, scales, precision and locales", () => {
	const specifications = [
		{ kind: "number", maximumFractionDigits: 2 },
		{ kind: "number", notation: "scientific", maximumSignificantDigits: 4 },
		{ kind: "number", notation: "engineering", roundingMode: "floor" },
		{ kind: "number", compactExponent: 3, compactDisplay: "long", maximumFractionDigits: 1 },
		{ kind: "number", roundingIncrement: 5, minimumFractionDigits: 2, maximumFractionDigits: 2 },
		{ kind: "number", maximumSignificantDigits: 3, maximumFractionDigits: 1, roundingPriority: "morePrecision" },
		{ kind: "number", signDisplay: "never" },
		{ kind: "number", signDisplay: "negative", negativeDisplay: "parentheses", maximumFractionDigits: 0 },
		{ kind: "currency", currency: "USD", currencySign: "accounting" },
		{ kind: "currency", currency: "USD", currencyDisplay: "name" },
		{ kind: "unit", unit: "meter", unitDisplay: "long" },
		{ kind: "percentage", percentageScale: 10000, maximumFractionDigits: 2 },
		{ kind: "bytes" }, { kind: "bytes", byteBase: 1000 },
		{ kind: "bytes", byteExponent: 2 },
	];
	for (const locale of ["en-US", "de-DE", "ar-EG", "bn"]) for (const options of specifications) {
		const compiled = formatter.compile({ ...options, locale });
		const parsing = createParser().compile(compiled.spec);
		for (const value of ["-1234.567", "-0.001", "-0", "0", "0.001", "1.025", "1048575", "9007199254740993.125"]) {
			const result = compiled.formatDetailed(value);
			assert.equal(result.text, compiled.format(value));
			assert.equal(result.roundedValue, parsing.parse(result.text), JSON.stringify({ options, locale, value }));
		}
	}
});

test("detailed fallback retains special-display and compact parsing behavior", () => {
	for (const spec of [
		{ kind: "number", notation: "compact", locale: "fr", compactDisplay: "long" },
		{ kind: "number", compactExponent: 3, compactDisplay: "long", locale: "fr" },
		{ kind: "number", zeroDisplay: "—", nanDisplay: "missing", infinityDisplay: "unbounded" },
		{ kind: "number", decimalSeparator: ":", groupSeparator: "_" },
		{ kind: "ordinal" },
	]) {
		const compiled = formatter.compile(spec);
		const parsing = createParser().compile(compiled.spec);
		for (const value of ["0", "-0", "1000", "-2000", "NaN", "Infinity", "-Infinity"]) {
			const result = compiled.formatDetailed(value);
			assert.equal(result.roundedValue, parsing.parse(result.text));
		}
	}
});
