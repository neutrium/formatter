import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@neutrium/decimal";
import { formatter as builtInFormatter, renderTokens } from "@neutrium/formatter";

test("passes exact strings, bigints, and Decimal values through Intl without Number coercion", () => {
	const spec = { kind: "number", maximumFractionDigits: 3 };
	assert.equal(builtInFormatter.format(9007199254740993n, spec), "9,007,199,254,740,993");
	assert.equal(builtInFormatter.format("123456789123456789.995", spec), "123,456,789,123,456,789.995");
	assert.equal(
		builtInFormatter.format(new Decimal("9007199254740993.25"), { kind: "number", maximumFractionDigits: 2 }),
		"9,007,199,254,740,993.25",
	);
	assert.equal(
		builtInFormatter.format({
			toValue: () => "9007199254740994.75",
			toString: () => { throw new Error("toString must not be used"); },
		}, { kind: "number", maximumFractionDigits: 2 }),
		"9,007,199,254,740,994.75",
	);
	assert.equal(builtInFormatter.format("4.321e4", spec), "43,210");
	assert.equal(builtInFormatter.format(-0, spec), "-0");
});

test("uses Intl precision, rounding, grouping, and sign options directly", () => {
	assert.equal(builtInFormatter.format("1.245", {
		kind: "number",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
		roundingMode: "halfEven",
	}), "1.24");
	assert.equal(builtInFormatter.format("1.255", {
		kind: "number",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
		roundingMode: "halfEven",
	}), "1.26");
	assert.equal(builtInFormatter.format("1.03", {
		kind: "number",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
		roundingIncrement: 5,
	}), "1.05");
	assert.equal(builtInFormatter.format(12345, { kind: "number", maximumSignificantDigits: 3 }), "12,300");
	assert.equal(builtInFormatter.format(12.3, {
		kind: "number",
		minimumIntegerDigits: 5,
		minimumFractionDigits: 2,
		useGrouping: false,
	}), "00012.30");
	assert.equal(builtInFormatter.format(12, { kind: "number", signDisplay: "always" }), "+12");
});

test("keeps direct string formatting identical to semantic-part rendering", () => {
	for (const [value, spec] of [
		[12345.678, { kind: "number", maximumFractionDigits: 2 }],
		[-12345, { kind: "number", notation: "scientific", signDisplay: "always" }],
		[-12.5, { kind: "currency", currency: "AUD", currencySign: "accounting" }],
		[0.125, { kind: "percentage", maximumFractionDigits: 1 }],
		[12.5, { kind: "unit", unit: "kilometer-per-hour", unitDisplay: "long" }],
	])
	{
		assert.equal(builtInFormatter.format(value, spec), builtInFormatter.formatToParts(value, spec).map((part) => part.value).join(""));
	}
});

test("formats and strictly parses scientific and engineering notation", () => {
	const scientific = { kind: "number", notation: "scientific", maximumFractionDigits: 4 };
	const engineering = { kind: "number", notation: "engineering", maximumFractionDigits: 5 };
	assert.equal(builtInFormatter.format(12345, scientific), "1.2345E4");
	assert.equal(parser.parse("1.2345E4", scientific), "12345");
	assert.equal(builtInFormatter.format("0.00012345", engineering), "123.45E-6");
	assert.equal(parser.parse("123.45E-6", engineering), "0.00012345");
	assert.throws(() => parser.parse("12345", scientific), /Invalid formatted number/);
});

test("formats and parses automatic and fixed compact magnitudes", () => {
	const automatic = { kind: "number", notation: "compact" };
	assert.equal(builtInFormatter.format(1200000, automatic), "1.2M");
	assert.equal(parser.parse("1.2M", automatic), "1200000");
	const fixed = { kind: "number", compactExponent: 6, maximumFractionDigits: 2 };
	assert.equal(builtInFormatter.format(1234567, fixed), "1.23M");
	assert.equal(parser.parse("1.23M", fixed), "1230000");
	assert.deepEqual(builtInFormatter.formatToParts(1200000, fixed), [
		{ type: "integer", value: "1" },
		{ type: "decimal", value: "." },
		{ type: "fraction", value: "2" },
		{ type: "unit", value: "M" },
	]);
	assert.throws(
		() => builtInFormatter.format(1234567, { kind: "number", locale: "ja-JP", compactExponent: 6 }),
		/does not start a compact magnitude/,
	);
	assert.equal(builtInFormatter.format(12345, {
		kind: "number",
		locale: "ja-JP",
		compactExponent: 4,
		maximumFractionDigits: 2,
	}), "1.23万");
});

test("formats percentages and reverses configurable power-of-ten scaling", () => {
	const normal = { kind: "percentage", maximumFractionDigits: 1 };
	assert.equal(builtInFormatter.format(0.125, normal), "12.5%");
	assert.equal(parser.parse("12.5%", normal), "0.125");
	const basisPoints = {
		kind: "percentage",
		percentageScale: 10000,
		percentageSymbol: " bp",
		maximumFractionDigits: 0,
	};
	assert.equal(builtInFormatter.format("0.0125", basisPoints), "125 bp");
	assert.equal(parser.parse("125 bp", basisPoints), "0.0125");
});

test("formats and parses SI and IEC byte units exactly", () => {
	assert.equal(builtInFormatter.format(1536, { kind: "bytes" }), "1.5 KiB");
	assert.equal(parser.parse("1.5 KiB", { kind: "bytes" }), "1536");
	assert.equal(builtInFormatter.format(1500000, { kind: "bytes", byteBase: 1000 }), "1.5 MB");
	assert.equal(parser.parse("1.5 MB", { kind: "bytes", byteBase: 1000 }), "1500000");
	assert.equal(builtInFormatter.format(1048576, {
		kind: "bytes",
		minimumSignificantDigits: 3,
		maximumSignificantDigits: 3,
	}), "1.00 MiB");
});

test("accepts ISO currency codes and preserves Intl currency structure", () => {
	assert.equal(builtInFormatter.format(12, { kind: "currency", currency: "USD" }), "$12.00");
	const spec = { kind: "currency", currency: "USD", currencySign: "accounting" };
	assert.equal(builtInFormatter.format(-1234.5, spec), "($1,234.50)");
	assert.equal(parser.parse("($1,234.50)", spec), "-1234.5");
	assert.equal(builtInFormatter.format(12.345, {
		kind: "currency",
		currency: "USD",
		currencySymbol: "¤",
		minimumFractionDigits: 3,
		maximumFractionDigits: 3,
	}), "¤12.345");
});

test("renders general negative values with parse-symmetric parentheses", () => {
	for (const [value, spec, expected] of [
		[-1234.5, { kind: "number", negativeDisplay: "parentheses" }, "(1,234.5)"],
		[-0.125, { kind: "percentage", maximumFractionDigits: 1, negativeDisplay: "parentheses" }, "(12.5%)"],
		[-1536, { kind: "bytes", negativeDisplay: "parentheses" }, "(1.5 KiB)"],
		[-23, { kind: "ordinal", negativeDisplay: "parentheses" }, "(23rd)"],
		[-1234.5, { kind: "currency", currency: "USD", negativeDisplay: "parentheses" }, "($1,234.50)"],
	])
	{
		assert.equal(builtInFormatter.format(value, spec), expected);
		assert.equal(builtInFormatter.format(parser.parse(expected, spec), spec), expected);
	}
	assert.equal(builtInFormatter.format(-0, { kind: "number", negativeDisplay: "parentheses" }), "(0)");
	assert.equal(builtInFormatter.format(-0, {
		kind: "number",
		negativeDisplay: "parentheses",
		signDisplay: "negative",
	}), "0");
	assert.equal(builtInFormatter.format(-12, {
		kind: "number",
		negativeDisplay: "parentheses",
		signDisplay: "never",
	}), "12");
});

test("reads structural numeric inputs once on the direct formatting path", () => {
	let reads = 0;
	const value = {
		toValue() {
			reads += 1;
			return "1234.5";
		},
	};
	assert.equal(builtInFormatter.format(value, { kind: "number" }), "1,234.5");
	assert.equal(reads, 1);
});

test("zero displays replace the whole output while other special displays retain affixes", () => {
	const spec = { kind: "number", zeroDisplay: "—", nanDisplay: "N/A", infinityDisplay: "∞" };
	assert.equal(builtInFormatter.format(0, spec), "—");
	assert.equal(builtInFormatter.format(-0, spec), "—");
	assert.equal(builtInFormatter.format(NaN, spec), "N/A");
	assert.equal(builtInFormatter.format(Infinity, spec), "∞");
	assert.equal(builtInFormatter.format(-Infinity, spec), "-∞");
	assert.equal(parser.parse("—", spec), "0");
	assert.throws(() => parser.parse("-—", spec), TypeError);
	assert.equal(parser.parse("N/A", spec), "NaN");
	assert.equal(parser.parse("-∞", spec), "-Infinity");
	assert.equal(builtInFormatter.format(0, { kind: "currency", currency: "USD", zeroDisplay: "free" }), "free");
});

test("rejects structurally invalid or mismatched presentations", () => {
	assert.throws(() => parser.parse("1,,2", { kind: "number" }), /Invalid formatted number/);
	assert.throws(() => parser.parse("12.5%", { kind: "number" }), /Invalid formatted number/);
	assert.throws(() => parser.parse("1.5 KiB", { kind: "number" }), /Invalid formatted number/);
	assert.throws(() => parser.parse("12", { kind: "percentage" }), /Invalid formatted percentage/);
	assert.throws(() => parser.parse("12st", { kind: "ordinal" }), /Invalid formatted ordinal/);
	assert.throws(() => parser.parse("1.5", { kind: "bytes" }), /Invalid formatted bytes/);
	assert.throws(() => parser.parse("1e3", { kind: "number" }), /Invalid formatted number/);
});

test("uses clean, discriminated Intl-first specifications", () => {
	assert.equal(builtInFormatter.format(1234.5, {
		kind: "number",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}), "1,234.50");
	assert.equal(builtInFormatter.format(1234.5, { kind: "currency", currency: "USD" }), "$1,234.50");
	assert.equal(builtInFormatter.format(0.125, { kind: "percentage", maximumFractionDigits: 1 }), "12.5%");
	assert.equal(builtInFormatter.format(23, { kind: "ordinal" }), "23rd");
	assert.equal(builtInFormatter.format(1536, { kind: "bytes" }), "1.5 KiB");
	assert.equal(builtInFormatter.format(3661, { kind: "duration", presentation: "elapsed" }), "1:01:01");
});

test("maps Intl parts into stable semantic tokens", () => {
	const spec = {
		kind: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	};
	const parts = builtInFormatter.formatToParts(-1234.5, spec);
	assert.deepEqual(parts, [
		{ type: "sign", value: "-" },
		{ type: "currency", value: "$" },
		{ type: "integer", value: "1" },
		{ type: "group", value: "," },
		{ type: "integer", value: "234" },
		{ type: "decimal", value: "." },
		{ type: "fraction", value: "50" },
	]);
	assert.equal(renderTokens(parts), builtInFormatter.format(-1234.5, spec));

	const exponentParts = builtInFormatter.formatToParts(12345, {
		kind: "number",
		notation: "scientific",
		maximumFractionDigits: 2,
	});
	assert.equal(renderTokens(exponentParts), "1.23E4");
	assert.deepEqual(exponentParts.map((part) => part.type), [
		"integer", "decimal", "fraction", "exponentSeparator", "exponentInteger",
	]);
});
