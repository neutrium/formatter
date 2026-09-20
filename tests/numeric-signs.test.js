import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";

test("parentheses preserve signed rounding across numeric domains", () => {
	const domains = [
		[{ kind: "number" }, 1],
		[{ kind: "currency", currency: "USD" }, 1],
		[{ kind: "percentage" }, 0.01],
		[{ kind: "unit", unit: "meter" }, 1],
		[{ kind: "bytes", byteExponent: 1 }, 1024],
		[{ kind: "ordinal" }, 1],
		[{ kind: "number", compactExponent: 3 }, 1000],
	];
	for (const [domain, scale] of domains) {
		for (const [roundingMode, input, rounded] of [
			["floor", -1.2, -2], ["ceil", -1.2, -1],
			["halfFloor", -1.5, -2], ["halfCeil", -1.5, -1],
			["expand", -1.2, -2], ["trunc", -1.2, -1],
			["halfExpand", -1.5, -2], ["halfTrunc", -1.5, -1], ["halfEven", -1.5, -2],
		]) {
			const spec = { ...domain, maximumFractionDigits: 0, roundingMode, negativeDisplay: "parentheses" };
			const value = input * scale;
			const expected = `(${formatter.format(-rounded * scale, { ...domain, maximumFractionDigits: 0 })})`;
			const compiled = formatter.compile(spec);
			assert.equal(formatter.format(value, spec), expected);
			assert.equal(renderTokens(formatter.formatToParts(value, spec)), expected);
			assert.equal(compiled.format(value), expected);
			assert.equal(parser.compile(compiled.spec).parse(expected), String(rounded * scale));
			assert.equal(compiled.formatDetailed(value).roundedValue, String(rounded * scale));
			assert.deepEqual(compiled.formatSeries([value]), [expected]);
		}
	}
});

test("parentheses follow signDisplay after rounding to zero", () => {
	for (const signDisplay of ["negative", "exceptZero", "auto", "always", "never"]) {
		for (const [domain, input] of [
			[{ kind: "number" }, -0.1],
			[{ kind: "currency", currency: "USD", currencySign: "accounting" }, -0.1],
			[{ kind: "percentage" }, -0.001],
			[{ kind: "bytes", byteExponent: 1 }, -1],
			[{ kind: "number", compactExponent: 3 }, -1],
		]) {
			const spec = { ...domain, maximumFractionDigits: 0, signDisplay, negativeDisplay: "parentheses" };
			const visible = signDisplay === "auto" || signDisplay === "always";
			const zero = formatter.format(0, { ...domain, maximumFractionDigits: 0, signDisplay: "never" });
			const expected = visible ? `(${zero})` : zero;
			const compiled = formatter.compile(spec);
			assert.equal(formatter.format(input, spec), expected);
			assert.equal(renderTokens(compiled.formatToParts(input)), expected);
			assert.equal(compiled.format(input), expected);
			assert.equal(compiled.formatDetailed(input).roundedValue, visible ? "-0" : "0");
		}
	}
});
