import { parser, createParser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";

test("display override whitespace round-trips through direct and compiled parsing", () => {
	for (const [spec, values] of [
		[{ kind: "number", zeroDisplay: " zero ", nanDisplay: " NaN ", infinityDisplay: " infinity " }, ["0", "-0", "NaN", "Infinity", "-Infinity"]],
		[{ kind: "currency", currency: "USD", currencySymbol: " USD " }, ["0", "12.25", "-12.25"]],
		[{ kind: "unit", unit: "meter", unitSymbol: " m \t" }, ["1", "-2"]],
		[{ kind: "percentage", percentageSymbol: " percent \n" }, ["0.25", "-0.25"]],
		[{ kind: "ordinal", ordinalPatterns: { other: " \t{number}th \n" } }, ["1", "-2"]],
	]) {
		const compiled = formatter.compile(spec);
		const parsing = parser.compile(compiled.spec);
		for (const value of values) {
			const text = formatter.format(value, spec);
			const expected = spec.zeroDisplay !== undefined && value === "-0" ? "0" : value;
			for (const input of [text, text.trim(), `\n ${text} \t`]) {
				assert.equal(parser.parse(input, spec), expected);
				assert.equal(parsing.parse(input), expected);
			}
			assert.equal(formatter.formatDetailed(value, spec).roundedValue, expected);
			assert.equal(compiled.formatDetailed(value).roundedValue, expected);
		}
	}
	assert.equal(parser.parse(" \t1,234.5\n", { kind: "number" }), "1234.5");
	assert.throws(() => parser.parse("12 34", { kind: "number" }));
});

test("exact whitespace displays take precedence over whitespace-tolerant matches", () => {
	const spec = { kind: "number", zeroDisplay: "zero", nanDisplay: "", infinityDisplay: "  " };
	for (const value of ["0", "NaN", "Infinity"]) {
		const text = formatter.format(value, spec);
		assert.equal(parser.parse(text, spec), value);
		assert.equal(formatter.formatDetailed(value, spec).roundedValue, value);
	}
});

test("exact numeric presentations beat trimmed overrides regardless of parser history", () => {
	for (const [option, special] of [["nanDisplay", "NaN"], ["infinityDisplay", "Infinity"]]) {
		const spec = { kind: "number", notation: "compact", [option]: " 1K " };
		for (const warmup of [[], ["2K"], [" 1K "], ["invalid"]]) {
			const parser = createParser();
			const compiled = parser.compile(spec);
			for (const text of warmup) {
				if (text === "invalid") assert.throws(() => compiled.parse(text), TypeError);
				else compiled.parse(text);
			}
			assert.equal(compiled.parse("1K"), "1000");
			assert.equal(parser.parse("1K", compiled.spec), "1000");
			assert.equal(compiled.parse(" 1K "), special);
			// With no exact presentation, the existing tolerant-special precedence remains.
			assert.equal(compiled.parse("\t1K\n"), special);
			assert.equal(compiled.parse("1K"), "1000");
		}
	}
});

test("whitespace optimization preserves exact custom presentations and live option changes", () => {
	for (const spec of [
		{ kind: "number", notation: "compact", zeroDisplay: " 1K " },
		{ kind: "number", notation: "compact", nanDisplay: " 1K " },
		{ kind: "number", notation: "compact", infinityDisplay: " 1K " },
		{ kind: "number", groupSeparator: " \t" },
		{ kind: "number", decimalSeparator: " \t" },
		{ kind: "currency", currency: "USD", currencySymbol: " $ " },
		{ kind: "unit", unit: "meter", unitSymbol: " m " },
		{ kind: "percentage", percentageSymbol: " % " },
		{ kind: "ordinal", ordinalPatterns: { other: " {number}th " } },
		{ kind: "number", locale: "fr", compactExponent: 3, compactDisplay: "long" },
	]) {
		const compiled = createParser().compile(spec);
		const value = spec.zeroDisplay ? 0 : spec.nanDisplay ? NaN : spec.infinityDisplay ? Infinity : 1234.5;
		const detail = formatter.formatDetailed(value, spec);
		assert.equal(compiled.parse(detail.text), detail.roundedValue);
		assert.equal(compiled.parse(`\t${detail.text}\n`), detail.roundedValue);
	}
	const parser = createParser();
	const spec = { kind: "number", notation: "compact" };
	assert.equal(parser.parse(" 1K ", spec), "1000");
	spec.zeroDisplay = " 1K ";
	assert.equal(parser.parse(" 1K ", spec), "0");
	assert.equal(parser.parse("1K", spec), "0");
	delete spec.zeroDisplay;
	assert.equal(parser.parse(" 1K ", spec), "1000");
});
