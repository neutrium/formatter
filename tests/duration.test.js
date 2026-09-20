import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter as builtInFormatter, renderTokens, UnsupportedParseError, formatter } from "@neutrium/formatter";
import { countCalls } from "./helpers/intl-probes.js";

test("formats and parses exact second-based durations", () => {
	const spec = { kind: "duration", presentation: "elapsed" };
	assert.equal(builtInFormatter.format(3661, spec), "1:01:01");
	assert.equal(builtInFormatter.format(-61, spec), "-0:01:01");
	assert.equal(parser.parse("123456789123456789:01:01", spec), "444444440844444440461");
	assert.throws(() => parser.parse("01:01", spec), /Invalid formatted duration/);
	assert.equal(builtInFormatter.format(-61, { ...spec, locale: "ar-EG" }), "-0:01:01");
	assert.equal(parser.parse("-0:01:01", { ...spec, locale: "ar-EG" }), "-61");
});

test("converts millisecond inputs symmetrically", () => {
	const spec = { kind: "duration", presentation: "elapsed", inputUnit: "milliseconds" };
	assert.equal(builtInFormatter.format(3661000, spec), "1:01:01");
	assert.equal(parser.parse("1:01:01", spec), "3661000");
});

test("elapsed durations follow sign-display semantics", () => {
	assert.equal(builtInFormatter.format(61, { kind: "duration", presentation: "elapsed", signDisplay: "always" }), "+0:01:01");
	assert.equal(builtInFormatter.format(0, { kind: "duration", presentation: "elapsed", signDisplay: "exceptZero" }), "0:00:00");
});

test("formats and parses negative durations with parentheses", () => {
	const spec = { kind: "duration", presentation: "elapsed", negativeDisplay: "parentheses" };
	assert.equal(builtInFormatter.format(-61, spec), "(0:01:01)");
	assert.equal(parser.parse("(0:01:01)", spec), "-61");
	assert.deepEqual(builtInFormatter.formatToParts(-61, spec).slice(0, 1), [{ type: "sign", value: "(" }]);
	assert.equal(builtInFormatter.format(-0, { ...spec, signDisplay: "negative" }), "0:00:00");
});

test("round-trips duration special values", () => {
	const spec = { kind: "duration", presentation: "elapsed" };
	assert.equal(parser.parse(builtInFormatter.format(NaN, spec), spec), "NaN");
	assert.equal(parser.parse(builtInFormatter.format(Infinity, spec), spec), "Infinity");
	assert.equal(parser.parse(builtInFormatter.format(-Infinity, spec), spec), "-Infinity");
});

test("emits duration-specific semantic tokens", () => {
	const spec = { kind: "duration", presentation: "elapsed", signDisplay: "always" };
	const parts = builtInFormatter.formatToParts(3661, spec);
	assert.deepEqual(parts, [
		{ type: "sign", value: "+" },
		{ type: "hours", value: "1" },
		{ type: "literal", value: ":" },
		{ type: "minutes", value: "01" },
		{ type: "literal", value: ":" },
		{ type: "seconds", value: "01" },
	]);
	assert.equal(renderTokens(parts), "+1:01:01");
});

test("validates duration syntax and configuration", () => {
	assert.throws(() => parser.parse("1:60:00", { kind: "duration", presentation: "elapsed" }), /Invalid formatted duration/);
	assert.throws(() => parser.parse("1:00", { kind: "number" }), /Invalid formatted number/);
	assert.throws(
		() => parser.parse("1:00:00", { kind: "duration", presentation: "elapsed", inputUnit: "minutes" }),
		/Invalid duration format option: inputUnit/,
	);
});

test("formats localized scalar and record durations through Intl.DurationFormat", () => {
	assert.equal(builtInFormatter.format(3661, { kind: "duration", presentation: "localized", style: "long" }), "1 hour, 1 minute, 1 second");
	assert.equal(builtInFormatter.format(
		{ hours: 3, minutes: 25, seconds: 7 },
		{ kind: "duration", presentation: "localized", style: "long", locale: "fr-FR" },
	), "3 heures, 25 minutes et 7 secondes");
	assert.equal(builtInFormatter.format(
		{ days: 1, hours: 2 },
		{ kind: "duration", presentation: "localized", style: "digital" },
	), "1 day, 2:00:00");
	assert.equal(builtInFormatter.format(
		{ seconds: 1, milliseconds: 500 },
		{ kind: "duration", presentation: "localized", style: "digital" },
	), "0:00:01.5");
	assert.equal(builtInFormatter.format("1.125", {
		kind: "duration", presentation: "localized",
		style: "digital",
		fractionalDigits: 2,
		roundingMode: "halfEven",
	}), "0:00:01.12");
	assert.equal(builtInFormatter.format("1.5", { kind: "duration", presentation: "localized", style: "long" }), "1 second, 500 milliseconds");
	assert.throws(
		() => builtInFormatter.format({ hours: 3, minutes: 25, seconds: 7 }, { kind: "duration", presentation: "elapsed" }),
		/requir.*explicitly localized/i,
	);
});

test("maps localized duration parts and applies wrapper sign presentation", () => {
	const spec = { kind: "duration", presentation: "localized", style: "narrow", negativeDisplay: "parentheses" };
	const value = { hours: -3, minutes: -25, milliseconds: -500 };
	assert.equal(builtInFormatter.format(value, spec), "(3h 25m 500ms)");
	const parts = builtInFormatter.formatToParts(value, spec);
	assert.equal(renderTokens(parts), "(3h 25m 500ms)");
	assert.deepEqual(parts.filter((part) => part.type.endsWith("s")).map((part) => part.type), [
		"hours", "minutes", "milliseconds",
	]);
	assert.equal(builtInFormatter.format(
		{ hours: 3, minutes: 5, seconds: 7 },
		{ kind: "duration", presentation: "localized", style: "digital", locale: "ar-EG" },
	), "٣:٠٥:٠٧");
	assert.equal(builtInFormatter.format(
		{ hours: -3, minutes: -5, seconds: -7 },
		{ kind: "duration", presentation: "localized", style: "digital", locale: "ar-EG" },
	), "؜-٣:٠٥:٠٧");
});

test("validates duration records and keeps localized parsing explicitly unsupported", () => {
	assert.throws(
		() => builtInFormatter.format({ hours: 1, minutes: -2 }, { kind: "duration", presentation: "localized", style: "long" }),
		/consistent sign/,
	);
	assert.throws(
		() => builtInFormatter.format({ hours: 1.5 }, { kind: "duration", presentation: "localized", style: "long" }),
		/safe integer/,
	);
	assert.throws(
		() => parser.parse("1 hour", { kind: "duration", presentation: "localized", style: "long" }),
		UnsupportedParseError,
	);
	assert.match(builtInFormatter.format(3661, { kind: "duration", presentation: "localized", hours: "long" }), /1 hour/);
	assert.throws(
		() => parser.parse("1 hour, 1 min, 1 sec", { kind: "duration", presentation: "localized", hours: "long" }),
		UnsupportedParseError,
	);
});

test("duration record limits use exact arithmetic", () => {
	const Constructor = Intl.DurationFormat;
	const spec = { kind: "duration", presentation: "localized", style: "long" };
	const limit = 2n ** 53n;
	const compiled = formatter.compile(spec);
	for (const sign of [1, -1]) for (const fraction of [500, 999]) {
		for (const value of [
			{ seconds: sign * Number(limit - 1n), milliseconds: sign * fraction },
			{ days: sign * Number((limit - 1n) / 86400n), seconds: sign * Number((limit - 1n) % 86400n),
				milliseconds: sign * fraction, microseconds: sign * 999, nanoseconds: sign * 999 },
		]) {
			const text = formatter.format(value, spec);
			assert.equal(compiled.format(value), text);
			assert.equal(renderTokens(formatter.formatToParts(value, spec)), text);
			assert.equal(text, new Constructor("en-US", { style: "long" }).format(value));
		}
		const invalid = { seconds: sign * Number(limit - 1n), milliseconds: sign * 1000 };
		assert.throws(() => formatter.format(invalid, spec), /less than 2\^53/);
		assert.throws(() => compiled.format(invalid), /less than 2\^53/);
	}
});

test("native durations preserve numeric inheritance, display defaults and exact fractions", () => {
	const cases = [
		[{ hours: 1, minutes: 2 }, { hours: "numeric", minutes: "2-digit" }, "1:02:00"],
		[{ minutes: 2 }, { style: "digital", hoursDisplay: "auto" }, "02:00"],
		[{ hours: 1 }, { style: "digital", minutesDisplay: "auto", secondsDisplay: "auto" }, "1"],
		[{ hours: 1, seconds: 2 }, { style: "digital", minutesDisplay: "auto" }, "1:00:02"],
		[{ seconds: 0 }, { hours: "long" }, "0 hours"],
		[{ hours: 1, minutes: 2 }, { style: "digital", hours: "long" }, "1 hour, 2:00"],
		[{ seconds: 1, milliseconds: 234, microseconds: 567 }, { style: "long", milliseconds: "numeric", fractionalDigits: 2 }, "1.23 seconds"],
		[{ milliseconds: 1, microseconds: 234 }, { style: "long", microseconds: "numeric" }, "1.234 milliseconds"],
		[{ seconds: 1 }, { seconds: "numeric", fractionalDigits: 3 }, "1.000"],
		[{ hours: 3, minutes: 4 }, { hours: "2-digit", numberingSystem: "arab" }, "٠٣:٠٤:٠٠"],
		[{ seconds: 1, milliseconds: 999 }, { style: "long", milliseconds: "numeric", fractionalDigits: 0 }, "1 second"],
		[{ hours: 3, minutes: 4, seconds: 5 }, { style: "digital", locale: "fi" }, "3.04.05"],
	];
	for (const [value, options, expected] of cases) {
		const spec = { kind: "duration", presentation: "localized", ...options };
		assert.equal(formatter.format(value, spec), expected);
		assert.equal(renderTokens(formatter.formatToParts(value, spec)), expected);
		assert.equal(formatter.compile(spec).format(value), expected);
	}
	for (const options of [
		{ hours: "numeric", minutes: "long" },
		{ milliseconds: "numeric", millisecondsDisplay: "always" },
		{ milliseconds: "numeric", microseconds: "long" },
	]) {
		const spec = { kind: "duration", presentation: "localized", ...options };
		assert.throws(() => formatter.format(1, spec), RangeError);
		assert.throws(() => formatter.format(Infinity, spec), RangeError);
		assert.throws(() => formatter.formatToParts(NaN, spec), RangeError);
		assert.throws(() => formatter.compile(spec), RangeError);
		assert.equal(formatter.supports(spec), false);
	}
});
test("localized record signs follow displayed zero after native subsecond truncation", () => {
	for (const [options, record, zero, body] of [
		[{ style: "digital", fractionalDigits: 0 }, { milliseconds: 999, microseconds: 999, nanoseconds: 999 }, true, "0:00:00"],
		[{ style: "digital", fractionalDigits: 2 }, { milliseconds: 9 }, true, "0:00:00.00"],
		[{ style: "digital", fractionalDigits: 2 }, { microseconds: 10000 }, false, "0:00:00.01"],
		[{ style: "digital", fractionalDigits: 0 }, { milliseconds: 1000 }, false, "0:00:01"],
		[{ style: "long", milliseconds: "numeric", fractionalDigits: 0 }, { microseconds: 1 }, true, "0 seconds"],
		[{ style: "long", microseconds: "numeric", fractionalDigits: 1 }, { microseconds: 99 }, true, "0.0 milliseconds"],
		[{ style: "long", nanoseconds: "numeric", fractionalDigits: 2 }, { nanoseconds: 9 }, true, "0.00 microseconds"],
		[{ style: "long", fractionalDigits: 0 }, { milliseconds: 1 }, false, "1 millisecond"],
		[{ style: "long", milliseconds: "numeric", fractionalDigits: 0 }, { years: 1, nanoseconds: 1 }, false, "1 year, 0 seconds"],
	]) for (const signDisplay of ["auto", "always", "never", "negative", "exceptZero"]) {
		for (const negativeDisplay of ["sign", "parentheses"]) for (const negative of [false, true]) {
			const spec = { kind: "duration", presentation: "localized", ...options, signDisplay, negativeDisplay };
			const value = Object.fromEntries(Object.entries(record).map(([unit, count]) => [unit, negative ? -count : count]));
			const minus = negative && signDisplay !== "never" && (!zero || signDisplay === "auto" || signDisplay === "always");
			const plus = !negative && (signDisplay === "always" || signDisplay === "exceptZero" && !zero);
			const expected = minus ? negativeDisplay === "parentheses" ? `(${body})` : `-${body}` : (plus ? "+" : "") + body;
			const compiled = formatter.compile(spec);
			assert.equal(formatter.format(value, spec), expected);
			assert.equal(compiled.format(value), expected);
			assert.equal(renderTokens(compiled.formatToParts(value)), expected);
			assert.equal(compiled.formatDetailed(value).text, expected);
			assert.deepEqual(compiled.formatSeries([value]), [expected]);
		}
	}
});

test("displayed-zero duration signs preserve localized glyphs and the string fast path", () => {
	for (const locale of ["en-US", "ar-EG", "fa"]) {
		for (const signDisplay of ["auto", "always", "negative", "exceptZero"]) {
			const spec = { kind: "duration", presentation: "localized", style: "digital", fractionalDigits: 0, locale, signDisplay };
			const compiled = formatter.compile(spec);
			for (const negative of [false, true]) {
				const expected = compiled.format(negative ? "-0" : "0");
				const value = { milliseconds: negative ? -1 : 1 };
				assert.equal(countCalls(Intl.DurationFormat.prototype, "formatToParts", () =>
					assert.equal(compiled.format(value), expected)), 0);
				assert.equal(renderTokens(compiled.formatToParts(value)), expected);
			}
		}
	}
});

test("preserves full duration integers including trailing zeros and large values", () => {
	const spec = { kind: "duration", presentation: "elapsed" };
	for (const [value, expected] of [
		["60", "0:01:00"], ["3600", "1:00:00"], ["-60", "-0:01:00"],
		["59.5", "0:01:00"], ["3599.5", "1:00:00"],
		["360000000000000000000000000000", "100000000000000000000000000:00:00"],
	])
		assert.equal(builtInFormatter.format(value, spec), expected);
});

test("maps every Intl rounding direction for positive and negative duration ties", () => {
	assert.equal(builtInFormatter.format("1.5", { kind: "duration", presentation: "elapsed", roundingMode: "halfEven" }), "0:00:02");
	for (const [roundingMode, positive, negative] of [
		["ceil", 3, 2], ["floor", 2, 3], ["expand", 3, 3], ["trunc", 2, 2],
		["halfCeil", 3, 2], ["halfFloor", 2, 3], ["halfExpand", 3, 3],
		["halfTrunc", 2, 2], ["halfEven", 2, 2],
	])
	{
		const spec = { kind: "duration", presentation: "elapsed", roundingMode };
		assert.equal(builtInFormatter.format("2.5", spec), "0:00:0" + positive);
		assert.equal(builtInFormatter.format("-2.5", spec), "-0:00:0" + negative);
	}
	assert.equal(builtInFormatter.format("-0.1", { kind: "duration", presentation: "elapsed", roundingMode: "trunc" }), "-0:00:00");
});
