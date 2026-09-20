import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";
import { createParser } from "@neutrium/formatter/parse";
import { countNumberParts, withMethod } from "./helpers/intl-probes.js";
import { runIsolated } from "./helpers/isolated-process.js";

test("representative numeric inputs agree on cold imports and warm parser profiles", () => {
	// Literal inputs avoid warming formatting resources before the first parse.
	// Only this small smoke matrix needs fresh module caches for each case.
	for (const [spec, input, expected] of [
		[{ kind: "number" }, "9,007,199,254,740,993.125", "9007199254740993.125"],
		[{ kind: "number", signDisplay: "negative", negativeDisplay: "parentheses", maximumFractionDigits: 0 }, "(2)", "-2"],
		[{ kind: "number", notation: "scientific" }, "1.25E3", "1250"],
		[{ kind: "currency", currency: "USD", currencyDisplay: "name" }, "1.00 US dollars", "1"],
		[{ kind: "number", notation: "compact" }, "-1.2K", "-1200"],
		[{ kind: "percentage", locale: "fr", maximumFractionDigits: 1 }, "12,5 %", "0.125"],
		[{ kind: "bytes", byteExponent: 1 }, "1.5 KiB", "1536"],
		[{ kind: "ordinal" }, "21st", "21"],
		[{ kind: "number" }, "-0", "-0"],
		[{ kind: "number", zeroDisplay: "—" }, "—", "0"],
	]) runIsolated(`
		const { createParser } = await import('./dist/parse.js');
		const parser = createParser();
		const spec = ${JSON.stringify(spec)}, input = ${JSON.stringify(input)}, expected = ${JSON.stringify(expected)};
		assert.equal(parser.parse(input, spec), expected);
		const compiled = parser.compile(spec);
		assert.equal(compiled.parse(input), expected);
		assert.equal(parser.parse(input, compiled.spec), expected);
	`);
});

test("cold compact parsing discovers only the presentations needed by the input", () => {
	for (const [spec, value, expected, budget] of [
		[{ kind: "number", notation: "compact" }, 1234, "1200", 100],
		[{ kind: "unit", unit: "meter", notation: "compact", locale: "ar" }, 1234, "1200", 350],
		[{ kind: "currency", currency: "USD", currencyDisplay: "name", notation: "compact", compactDisplay: "long", maximumFractionDigits: 1, locale: "ru" }, 9999.9, "10000", 350],
		[{ kind: "number", locale: "lv", notation: "compact", compactDisplay: "long", maximumFractionDigits: 0, roundingIncrement: 25, roundingMode: "ceil" }, -1000, "-0", 750],
	]) {
		const input = formatter.format(value, spec);
		const parser = createParser();
		const compiled = parser.compile(spec);
		const cold = countNumberParts(() => assert.equal(compiled.parse(input), expected));
		assert.ok(cold <= budget, `${input}: ${cold} calls exceeds ${budget}`);
		const warm = countNumberParts(() => {
			assert.equal(compiled.parse(input), expected);
			assert.equal(parser.parse(input, compiled.spec), expected);
		});
		assert.ok(warm <= 6, `${input}: cached parse resumed discovery (${warm} calls)`);
	}
});

test("partial profiles resume for unseen magnitudes and stop probing once exhausted", () => {
	const compiled = createParser().compile({ kind: "number", notation: "compact", maximumFractionDigits: 1 });
	assert.equal(compiled.parse("1.2K"), "1200");
	assert.ok(countNumberParts(() => assert.equal(compiled.parse("1.3K"), "1300")) <= 1);
	const resumed = countNumberParts(() => assert.equal(compiled.parse("2B"), "2000000000"));
	assert.ok(resumed > 1, "A new magnitude should extend the partial profile");
	assert.ok(countNumberParts(() => assert.equal(compiled.parse("1.2K"), "1200")) <= 1);
	assert.throws(() => compiled.parse("invalid"), TypeError);
	assert.equal(countNumberParts(() => assert.throws(() => compiled.parse("invalid"), TypeError)), 0);
	assert.equal(compiled.parse("2T"), "2000000000000");
});

test("surrounding whitespace keeps cold native parsing incremental", () => {
	for (const [spec, value, budget] of [
		[{ kind: "number", notation: "compact" }, 1234, 100],
		[{ kind: "unit", unit: "meter", notation: "compact", locale: "ar" }, 1234, 350],
		[{ kind: "currency", currency: "USD", currencyDisplay: "name", notation: "compact", compactDisplay: "long", maximumFractionDigits: 1, locale: "ru" }, 9999.9, 350],
		[{ kind: "number", notation: "scientific", locale: "ar" }, -0.0125, 100],
		[{ kind: "bytes" }, 1536, 100],
		[{ kind: "percentage", locale: "fr" }, 0.125, 100],
	]) {
		const detail = formatter.formatDetailed(value, spec);
		const compiled = createParser().compile(spec);
		const input = ` \t\u00a0${detail.text}\u202f\n`;
		const calls = countNumberParts(() => assert.equal(compiled.parse(input), detail.roundedValue));
		assert.ok(calls <= budget, `${input}: ${calls} calls exceeds ${budget}`);
		assert.ok(countNumberParts(() => assert.equal(compiled.parse(input), detail.roundedValue)) <= 3);
		assert.equal(compiled.parse(detail.text), detail.roundedValue);
		assert.throws(() => compiled.parse(`${detail.text} junk`), TypeError);
	}
	const parser = createParser();
	const spec = { kind: "number", notation: "compact" };
	assert.ok(countNumberParts(() => assert.equal(parser.parse(" 1.2K ", spec), "1200")) <= 100);
	assert.equal(parser.parse(" 2B ", spec), "2000000000");
	assert.equal(parser.parse(" 1.2K ", spec), "1200");
	assert.throws(() => parser.parse("1 .2K", spec), TypeError);
});

test("special displays retain precedence without discovering ordinary patterns", () => {
	const spec = { kind: "number", notation: "compact", zeroDisplay: "1K", nanDisplay: " \t" };
	const compiled = createParser().compile(spec);
	const calls = countNumberParts(() => {
		assert.equal(compiled.parse("1K"), "0");
		assert.equal(compiled.parse(" \t"), "NaN");
	});
	assert.ok(calls <= 5, `Special-value parsing ran ordinary probes (${calls})`);
	assert.equal(compiled.parse("2K"), "2000");
	assert.equal(compiled.parse("1K"), "0");
});

test("partial discovery retries generator failures without poisoning previous results", () => {
	const compiled = createParser().compile({ kind: "number", notation: "compact" });
	assert.equal(compiled.parse("1.2K"), "1200");
	const failure = new RangeError("transient compact probe failure");
	withMethod(Intl.NumberFormat.prototype, "formatToParts", original => function (value) {
		if (this.resolvedOptions().notation === "compact" && Number(value) > 1000000) throw failure;
		return original.call(this, value);
	}, () => assert.throws(() => compiled.parse("2B"), error => error === failure));
	assert.equal(compiled.parse("1.2K"), "1200");
	assert.equal(compiled.parse("2B"), "2000000000");
});

test("syntax initialization failures retain the pending probe for retry", () => {
	const compiled = createParser().compile({ kind: "number", notation: "compact" });
	const failure = new RangeError("transient syntax probe failure");
	let fail = true;
	let ones = 0;
	withMethod(Intl.NumberFormat.prototype, "formatToParts", original => function (value) {
		const notation = this.resolvedOptions().notation;
		if (notation === "compact" && String(value) === "1") ones++;
		if (notation === "scientific" && fail) throw failure;
		return original.call(this, value);
	}, () => {
		assert.throws(() => compiled.parse("1"), error => error === failure);
		fail = false;
		assert.equal(compiled.parse("1"), "1");
		assert.equal(ones, 1, "Retry should process the pending probe, not skip or regenerate it");
	});
});
