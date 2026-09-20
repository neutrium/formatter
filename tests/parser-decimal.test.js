import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@neutrium/decimal/arithmetic";
import { createParser } from "@neutrium/formatter/parse";
import { createFormatter } from "@neutrium/formatter";
import { countCalls, withMethod } from "./helpers/intl-probes.js";

test("localized parsing rejects Decimal input syntax unless the presentation explicitly allows it", () => {
	const parser = createParser();
	for (const input of ["0xff", "0b1010", "0o17", "1_000", "1e3"])
		assert.throws(() => parser.parse(input, { kind: "number" }), TypeError, input);
	assert.equal(parser.parse("1_000", { kind: "number", groupSeparator: "_" }), "1000");
});

test("numeric parsing serializes only the final result on cold and warm profiles", () => {
	const parsing = createParser();
	const formatting = createFormatter();
	for (const [spec, value] of [
		[{ kind: "number" }, "1234.5"],
		[{ kind: "currency", currency: "USD", currencyDisplay: "name", maximumFractionDigits: 0 }, "1.2"],
		[{ kind: "bytes", byteExponent: 1 }, "1536"],
		[{ kind: "percentage" }, "0.125"],
	]) {
		const text = formatting.format(value, spec);
		const expected = formatting.formatDetailed(value, spec).roundedValue;
		for (let repeat = 0; repeat < 2; repeat++) {
			const serializations = countCalls(Decimal.prototype, "toFixed", () => assert.equal(parsing.parse(text, spec), expected));
			assert.equal(serializations, 1, `${spec.kind}, pass ${repeat}`);
		}
	}
});

test("Decimal parse caches preserve signed zero, special values, and exact large fractions", () => {
	const parsing = createParser();
	for (const [text, expected] of [["-0", "-0"], ["NaN", "NaN"], ["∞", "Infinity"],
		["-∞", "-Infinity"], ["9,007,199,254,740,993.25", "9007199254740993.25"]]) {
		for (let repeat = 0; repeat < 2; repeat++)
			assert.equal(parsing.parse(text, { kind: "number" }), expected);
	}
});

test("ordinary numeric verification reuses the reconstructed Decimal", () => {
	const compiled = createParser().compile({ kind: "number" });
	compiled.parse("1,234.567"); // Warm locale syntax and presentation patterns.
	const prototype = Object.getPrototypeOf(Decimal.prototype);
	let canonicalValue;
	let renderedValue;
	withMethod(prototype, "toFixed", toFixed => function (...args) {
		const text = toFixed.apply(this, args);
		if (text === "9876.543") canonicalValue = this;
		return text;
	}, () => withMethod(prototype, "toValue", toValue => function (...args) {
		const text = toValue.apply(this, args);
		if (text === "9876.543") renderedValue = this;
		return text;
	}, () => {
		assert.equal(compiled.parse("9,876.543"), "9876.543");
		assert.ok(canonicalValue);
		assert.equal(renderedValue, canonicalValue);
	}));
});
