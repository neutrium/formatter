import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { runIsolated } from "./helpers/isolated-process.js";
import { parseQuantity, dividePowerOfTwo, multiplyPowerOfTwo } from "../dist/numeric/shared/decimal-string.js";

test("byte metadata retains fixed SI and IEC scales for zero and nonzero values", () => {
	for (const byteBase of [1000, 1024]) for (const byteExponent of [0, 1, 2, 4]) {
		const spec = { kind: "bytes", byteBase, byteExponent };
		const compiled = formatter.compile(spec);
		for (const value of ["0", "-0", "1", "1536"]) {
			const expected = { kind: byteBase === 1000 ? "decimal" : "binary", exponent: byteExponent * (byteBase === 1000 ? 3 : 10) };
			assert.deepEqual(formatter.formatDetailed(value, spec).scale, expected);
			assert.deepEqual(compiled.formatDetailed(value).scale, expected);
		}
	}
	assert.deepEqual(formatter.formatDetailed(1536, { kind: "bytes" }).scale, { kind: "binary", exponent: 10 });
});

test("cached binary scaling preserves exact values across every byte exponent", () => {
	for (let byteExponent = 0; byteExponent <= 8; byteExponent++) {
		// These rendered coefficients need at most 20 fraction digits; test full arithmetic below.
		const factor = 2n ** BigInt(byteExponent * 10);
		const compiled = formatter.compile({ kind: "bytes", byteExponent, maximumFractionDigits: 20 });
		const parsing = parser.compile(compiled.spec);
		for (const value of [String(factor), byteExponent === 0 ? "-1.125" : String(-9n * factor / 8n),
			String(factor * 9007199254740993n), String(factor * 1234567890123456789012345678901234567890n)])
			assert.equal(parsing.parse(compiled.format(value)), value);
		// Independently verify full subunit precision, without Intl rounding it away.
		for (const value of ["1", "-1.125", "9007199254740993.125"])
			assert.equal(multiplyPowerOfTwo(dividePowerOfTwo(parseQuantity(value), byteExponent * 10), byteExponent * 10).toFixed(), value);
	}
	assert.equal(dividePowerOfTwo(parseQuantity("1"), 3).toFixed(), "0.125");
});

test("binary scaling reuses calculation constructors with a bounded precision cache", () => {
	runIsolated(`
		import { Decimal } from '@neutrium/decimal/arithmetic';
		const original = Decimal.clone;
		let clones = 0;
		Decimal.clone = function (...args) { clones++; return original.apply(this, args); };
		const { formatter } = await import('./dist/index.js');
		const compiled = formatter.compile({ kind: 'bytes', byteExponent: 1 });
		clones = 0;
		assert.equal(compiled.formatSeries(Array(1000).fill('1536')).length, 1000);
		assert.equal(clones, 1);
		compiled.formatSeries(Array(1000).fill('1536'));
		assert.equal(clones, 1);
		for (let digits = 10; digits < 80; digits++) compiled.format('1'.repeat(digits));
		const before = clones;
		assert.equal(compiled.format('1536'), '1.5 KiB');
		assert.equal(clones, before + 1); // The oldest precision was evicted.
	`);
});

test("byte parsing retains suffix scales at rounding boundaries and across shared series", () => {
	for (const [byteBase, boundary, text] of [
		[1024, 1048575, "1,024 KiB"], [1000, 999999, "1,000 kB"],
	]) {
		const spec = { kind: "bytes", byteBase };
		const compiled = formatter.compile(spec);
		assert.equal(compiled.format(boundary), text);
		assert.equal(parser.compile(compiled.spec).parse(text), String(byteBase ** 2));
		assert.equal(formatter.formatDetailed(boundary, spec).roundedValue, String(byteBase ** 2));
		assert.deepEqual(compiled.formatDetailed(boundary).scale,
			{ kind: byteBase === 1024 ? "binary" : "decimal", exponent: byteBase === 1024 ? 10 : 3 });
		const seriesSpec = { ...spec, maximumFractionDigits: 6, signDisplay: "exceptZero" };
		const series = formatter.formatSeries([0, 1, -1, byteBase ** 2], seriesSpec);
		const expected = byteBase === 1024 ? ["0", "1.048576", "-1.048576", "1048576"] : ["0", "1", "-1", "1000000"];
		assert.deepEqual(series.map(value => parser.parse(value, seriesSpec)), expected);
		assert.throws(() => parser.compile(compiled.spec).parse(byteBase === 1024 ? "10,24 KiB" : "10,00 kB"), TypeError);
		assert.throws(() => parser.parse(text, { ...spec, byteExponent: 2 }), TypeError);
	}
	assert.equal(parser.parse("1,024 B", { kind: "bytes" }), "1024");
});
