import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";

function checkDetailed(value, spec, expected) {
	const compiled = formatter.compile(spec);
	const detailed = compiled.formatDetailed(value);
	assert.equal(detailed.roundedValue, expected, JSON.stringify({ value, spec, text: detailed.text }));
	assert.equal(detailed.text, compiled.format(value));
	assert.equal(renderTokens(detailed.parts), detailed.text);
	assert.deepEqual(formatter.formatDetailed(value, spec), detailed);
	return detailed;
}

test("detailed numeric formatting recovers rendered infinity after finite overflow", () => {
	for (const locale of ["en-US", "ar-EG", "fr-FR"])
		for (const domain of [{ kind: "number" }, { kind: "currency", currency: "USD" },
			{ kind: "unit", unit: "meter" }, { kind: "percentage" }, { kind: "bytes" }, { kind: "ordinal", ordinalFallback: "number" }])
			for (const signDisplay of ["auto", "never"])
				for (const value of ["1e400", "-1e400"])
					checkDetailed(value, { ...domain, locale, signDisplay },
						signDisplay !== "never" && value.startsWith("-") ? "-Infinity" : "Infinity");
	for (const notation of ["standard", "scientific", "engineering", "compact"])
		for (const value of ["1e309", "-1e309"]) {
			const spec = { kind: "number", notation };
			const detail = checkDetailed(value, spec, value.startsWith("-") ? "-Infinity" : "Infinity");
			assert.equal(parser.parse(detail.text, spec), detail.roundedValue);
		}
	for (const spec of [{ kind: "number", compactExponent: 3 }, { kind: "bytes", byteExponent: 8 }]) {
		const detail = checkDetailed("1e400", spec, "Infinity");
		assert.deepEqual(detail.scale, spec.kind === "bytes" ? { kind: "binary", exponent: 80 } : { kind: "decimal", exponent: 3 });
	}
	// Overflow is normalized before scaling, just like an explicit infinity input.
	assert.deepEqual(formatter.formatDetailed("1e309", { kind: "bytes" }),
		formatter.formatDetailed(Infinity, { kind: "bytes" }));
});

test("literal override parentheses do not restore hidden negative signs", () => {
	for (const domain of [{ kind: "number" }, { kind: "currency", currency: "USD", currencySign: "accounting" },
		{ kind: "unit", unit: "meter" }, { kind: "percentage" }, { kind: "bytes" }, { kind: "ordinal" }]) {
		for (const negativeDisplay of ["sign", "parentheses"]) {
			const spec = { ...domain, negativeDisplay, signDisplay: "never", zeroDisplay: "(none)", infinityDisplay: "(unbounded)", nanDisplay: "(missing)" };
			for (const [value, expected] of [[-0, "0"], [-Infinity, "Infinity"], [NaN, "NaN"]]) {
				const detail = checkDetailed(value, spec, expected);
				assert.equal(parser.parse(detail.text, spec), expected);
			}
		}
	}
	for (const signDisplay of ["negative", "exceptZero"])
		checkDetailed(-0, { kind: "number", signDisplay, zeroDisplay: "(none)" }, "0");
});

test("real accounting and wrapper signs remain negative, including specials and rounded zero", () => {
	for (const signOptions of [{ kind: "currency", currency: "USD", currencySign: "accounting" },
		{ kind: "number", negativeDisplay: "parentheses" }]) {
		const spec = { ...signOptions, zeroDisplay: "(none)", infinityDisplay: "(unbounded)", maximumFractionDigits: 0 };
		for (const [value, expected] of [[-0, "0"], [-0.1, "0"], [-Infinity, "-Infinity"], [-12, "-12"]]) {
			const detail = checkDetailed(value, spec, expected);
			assert.equal(parser.parse(detail.text, spec), expected);
		}
		const overflow = checkDetailed("-1e400", signOptions, "-Infinity");
		assert.equal(parser.parse(overflow.text, signOptions), "-Infinity");
		// Overflow follows explicit infinity, including its display override.
		checkDetailed("-1e400", spec, "-Infinity");
		assert.equal(formatter.format("-1e400", spec), formatter.format(-Infinity, spec));
		checkDetailed(-0.1, { ...spec, signDisplay: "exceptZero" }, "0");
	}
});
