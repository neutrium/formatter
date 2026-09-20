import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { Decimal as CoreDecimal } from "@neutrium/decimal/core";
import { Decimal as ArithmeticDecimal, DecimalError } from "@neutrium/decimal/arithmetic";
import { Decimal as ScientificDecimal } from "@neutrium/decimal";
import {
	formatter as builtInFormatter,
} from "@neutrium/formatter";

test("accepts each Decimal tier and isolates exact byte scaling from their configurations", () => {
	const constructors = [CoreDecimal, ArithmeticDecimal, ScientificDecimal];
	const originals = constructors.map((Decimal) => ({ ...Decimal.config }));
	const input = "123456789012345678901234567890.125";
	// Exact division by 1024, computed independently using integer arithmetic.
	const product = 123456789012345678901234567890125n * 5n ** 10n;
	const digits = String(product);
	const expected = digits.slice(0, -13) + "." + digits.slice(-13);
	const spec = { kind: "bytes", byteExponent: 1, useGrouping: false, maximumFractionDigits: 20 };
	try
	{
		for (const Decimal of constructors) Decimal.config = { precision: 2, rounding: "floor" };
		const constrained = constructors.map(Decimal => ({ ...Decimal.config }));
		for (const [index, Decimal] of constructors.entries())
		{
			const tier = ["core", "arithmetic", "scientific"][index];
			assert.equal(builtInFormatter.format(new Decimal(input), spec), expected + " KiB", tier);
			assert.equal(builtInFormatter.format(new Decimal("9007199254740993.25"),
				{ kind: "number", maximumFractionDigits: 2 }), "9,007,199,254,740,993.25", tier);
			assert.equal(builtInFormatter.format(new Decimal("-0"), { kind: "number" }), "-0", tier);
		}
		assert.equal(parser.parse(expected + " KiB", spec), input);
		constructors.forEach((Decimal, index) => assert.deepEqual(Decimal.config, constrained[index]));
	}
	finally
	{
		constructors.forEach((Decimal, index) => { Decimal.config = originals[index]; });
	}
});

test("formatting accepts Decimal syntax without losing exact digits or signed zero", () => {
	const spec = { kind: "number", useGrouping: false, maximumFractionDigits: 20 };
	for (const [input, expected] of [
		["0xff", "255"], ["0XFF", "255"], ["-0xff", "-255"],
		["0b1010", "10"], ["0o17", "15"], ["1_000", "1000"],
		["1_2.3_4e+2", "1234"], ["1e1_0", "10000000000"],
		["0x1.8p-5", "0.046875"], ["0b1.01p3", "10"],
		["0x20_0000_0000_0001", "9007199254740993"],
		["0x123456789abcdef0123456789", "90144042682896311822508713865"],
		["-0x0", "-0"], ["-0b0", "-0"], ["-0o0", "-0"],
	]) {
		assert.equal(builtInFormatter.format(input, spec), expected, input);
	}
});

test("representative Decimal inputs reach scalar, collection and range operations", () => {
	// Syntax variants are covered above; these cases check downstream routing.
	const inputs = ["0xff", "0x1.8p-5"];
	const canonical = ["255", "0.046875"];
	for (const spec of [
		{ kind: "number" }, { kind: "number", notation: "compact" },
		{ kind: "currency", currency: "USD" }, { kind: "percentage" },
		{ kind: "bytes" }, { kind: "ordinal" }, { kind: "unit", unit: "meter" },
		{ kind: "duration", presentation: "elapsed" },
		{ kind: "duration", presentation: "localized", style: "digital", fractionalDigits: 3 },
	]) {
		const compiled = builtInFormatter.compile(spec);
		for (const method of ["format", "formatToParts", "formatDetailed"]) {
			const expected = compiled[method]("-16");
			let reads = 0;
			const input = { toValue() { reads++; return " \t-0x10\n"; } };
			const context = `${JSON.stringify(spec)} / ${method}`;
			assert.deepEqual(compiled[method](input), expected, context);
			assert.equal(reads, 1, context);
			assert.deepEqual(builtInFormatter[method]("-0x10", spec), expected, context);
		}
		for (const method of ["formatSeries", "formatSeriesToParts", "formatColumn"]) {
			const expected = compiled[method](canonical);
			const context = `${JSON.stringify(spec)} / ${method}`;
			assert.deepEqual(compiled[method](inputs), expected, context);
			assert.deepEqual(builtInFormatter[method](inputs, spec), expected, context);
		}
		if (compiled.formatRange) {
			assert.equal(compiled.formatRange("0b10", "0xff"), compiled.formatRange("2", "255"));
			assert.equal(builtInFormatter.formatRange("0b10", "0xff", spec), compiled.formatRange("2", "255"));
		}
	}
});

test("formatter propagates Decimal syntax errors and original input conversion failures", () => {
	for (const input of ["", "0x", "0xgg", "0b2", "0o8", "1__000", "_1000", "1000_", "1,000", "1e", "12 metres"]) {
		assert.throws(() => builtInFormatter.format(input, { kind: "number" }), DecimalError, input);
	}
	const failure = new Error("input conversion failure");
	assert.throws(() => builtInFormatter.format({ toValue() { throw failure; } }, { kind: "number" }),
		error => error === failure);
});
