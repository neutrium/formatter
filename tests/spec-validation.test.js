import { countRendering, withProperty } from "./helpers/intl-probes.js";
import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter, createFormatter, UnsupportedParseError } from "@neutrium/formatter";
import { Formatter } from "@neutrium/formatter/extensions";
import { runtimeCapabilities } from "@neutrium/formatter/diagnostics";

function assertRejected(spec, pattern) {
	const resolution = formatter.resolve(spec);
	assert.equal(resolution.supported, false, JSON.stringify(spec));
	assert.match(resolution.error.message, pattern);
	assert.equal(formatter.supports(spec), false);
	for (const run of [
		() => formatter.compile(spec),
		() => formatter.compileSeries([], spec),
		() => formatter.format(NaN, spec), () => formatter.formatToParts(Infinity, spec),
		() => formatter.formatDetailed(0, spec),
		...(spec.presentation === "localized" ? [] : [() => parser.parse("1", spec), () => parser.compile(spec)]),
		() => formatter.formatRange(1, 2, spec), () => formatter.formatRangeToParts(1, 2, spec),
		() => formatter.formatSeries([], spec), () => formatter.formatSeriesToParts([], spec),
		() => formatter.formatColumn([], spec),
	]) assert.throws(run, error => error.name === resolution.error.name && error.message === resolution.error.message);
}

test("numeric validation rejects unknown and wrong-domain options across operations", () => {
	for (const spec of [
		{ kind: "number", maximumFractonDigits: 2 },
		{ kind: "bytes", base: 999 },
		{ kind: "number", currency: "USD" },
		{ kind: "percentage", notation: "compact" },
		{ kind: "number", extra: undefined },
		Object.defineProperty({ kind: "number" }, "hidden", { value: true }),
		{ kind: "number", [Symbol("extra")]: true },
	]) assertRejected(spec, /Unknown .* format option/);
});

test("numeric validation rejects invalid wrapper values and coerced option types", () => {
	for (const [spec, pattern] of [
		[{ kind: "number", negativeDisplay: "invalid" }, /negativeDisplay/],
		[{ kind: "bytes", byteBase: 999 }, /byteBase/],
		[{ kind: "bytes", byteBase: "1000" }, /byteBase/],
		[{ kind: "bytes", byteExponent: 9 }, /byteExponent/],
		[{ kind: "bytes", byteExponent: 1.5 }, /byteExponent/],
		[{ kind: "percentage", percentageScale: 3 }, /power of ten/],
		[{ kind: "percentage", percentageScale: null }, /percentageScale/],
		[{ kind: "number", maximumFractionDigits: "2" }, /maximumFractionDigits/],
		[{ kind: "number", maximumFractionDigits: 1.5 }, /maximumFractionDigits/],
		[{ kind: "number", useGrouping: "false" }, /useGrouping/],
		[{ kind: "number", roundingMode: "toString" }, /roundingMode/],
		[{ kind: "number", zeroDisplay: 0 }, /zeroDisplay/],
		[{ kind: "number", decimalSeparator: null }, /decimalSeparator/],
		[{ kind: "number", locale: "" }, /./],
		[{ kind: "number", locale: ["en"] }, /locale/],
		[{ kind: "currency" }, /requires currency/],
		[{ kind: "currency", currency: 123 }, /currency/],
		[{ kind: "currency", currency: "USD", currencySign: "invalid" }, /currencySign/],
		[{ kind: "unit" }, /requires unit/],
		[{ kind: "unit", unit: "meter", unitDisplay: true }, /unitDisplay/],
		[{ kind: "ordinal", ordinalFallback: "invalid" }, /ordinalFallback/],
		[{ kind: "ordinal", ordinalPatterns: [] }, /ordinalPatterns/],
		[{ kind: "ordinal", ordinalPatterns: { one: "{number}st" } }, /other/],
		[{ kind: "ordinal", ordinalPatterns: { other: "no placeholder" } }, /pattern/],
		[{ kind: "ordinal", ordinalPatterns: { other: "{number}", bogus: "{number}" } }, /pattern/],
		[{ kind: "ordinal", ordinalPatterns: { other: "{number}", few: "invalid" } }, /pattern/],
		[{ kind: "number", compactExponent: 0 }, /compactExponent/],
		[{ kind: "number", compactExponent: 101 }, /compactExponent/],
		[{ kind: "number", compactExponent: 3, notation: "scientific" }, /requires compact notation/],
	]) assertRejected(spec, pattern);
});

test("preparation retains Intl and locale-specific validation without sample rendering", () => {
	for (const spec of [
		{ kind: "number", minimumFractionDigits: 3, maximumFractionDigits: 2 },
		{ kind: "number", minimumSignificantDigits: 0 },
		{ kind: "number", roundingIncrement: 3 },
		{ kind: "number", roundingIncrement: 5, maximumSignificantDigits: 2 },
		{ kind: "currency", currency: "INVALID" },
		{ kind: "unit", unit: "invalid" },
		{ kind: "number", numberingSystem: "!" },
		{ kind: "number", compactExponent: 4, locale: "ru" },
		{ kind: "ordinal", locale: "ar" },
	]) assertRejected(spec, /./);
});

test("duration validation rejects unknown options and invalid types with or without Intl.DurationFormat", () => {
	for (const Constructor of new Set([Intl.DurationFormat, undefined])) {
		withProperty(Intl, "DurationFormat", { value: Constructor }, () => {
			for (const presentation of ["elapsed", "localized"]) {
				const base = { kind: "duration", presentation };
				for (const extra of [
					{ inputUnt: "milliseconds" }, { currency: "USD" }, { maximumFractionDigits: 2 },
					{ extra: undefined }, { [Symbol("extra")]: undefined },
				]) assertRejected({ ...base, ...extra }, /Unknown duration format option/);
				assertRejected(Object.defineProperty({ ...base }, "hidden", { value: undefined }), /Unknown duration format option/);
				for (const locale of [null, false, 0, 123, [], ["en-US"], {}])
					assertRejected({ ...base, locale }, /locale/);
				for (const locale of ["", "en_US", "!"])
					assertRejected({ ...base, locale }, /./);
				for (const [name, value] of [
					["inputUnit", 1000], ["roundingMode", "toString"],
					["signDisplay", true], ["negativeDisplay", null],
				]) assertRejected({ ...base, [name]: value }, /duration/i);
			}
			const localized = { kind: "duration", presentation: "localized" };
			for (const numberingSystem of [null, false, 0, 123, [], ["latn"], {}])
				assertRejected({ ...localized, numberingSystem }, /numberingSystem/);
			for (const numberingSystem of ["", "!", "ab"])
				assertRejected({ ...localized, numberingSystem }, /./);
			for (const [name, value] of [
				["style", true], ["fractionalDigits", "2"], ["fractionalDigits", 1.5],
				["fractionalDigits", -1], ["fractionalDigits", 10],
				["hours", 2], ["years", "numeric"], ["milliseconds", "2-digit"],
				["secondsDisplay", false],
			]) assertRejected({ ...localized, [name]: value }, /duration/i);
			for (const options of [{ numberingSystem: "latn" }, { style: "long" }, { hours: "numeric" }])
				assertRejected({ kind: "duration", presentation: "elapsed", ...options }, /requires localized/);
		});
	}
});

test("duration validation observes inherited, non-enumerable and changing options", () => {
	for (const option of ["locale", "numberingSystem"]) {
		const base = { kind: "duration", presentation: "localized" };
		assertRejected(Object.defineProperty({ ...base }, option, { value: 123 }), new RegExp(option));
		let value = option === "locale" ? "en-US" : "latn";
		const inherited = Object.freeze(Object.assign(Object.create({ get [option]() { return value; } }), base));
		assert.equal(formatter.supports(inherited), true);
		value = 123;
		assert.equal(formatter.supports(inherited), false);
		assert.match(formatter.resolve(inherited).error.message, new RegExp(option));
		for (const run of [
			() => formatter.format(1, inherited), () => parser.parse("0:00:01", inherited),
			() => formatter.formatSeries([], inherited), () => formatter.formatDetailed(1, inherited),
		]) assert.throws(run, new RegExp(option));
	}
	const spec = { kind: "duration", presentation: "elapsed", locale: "en-US" };
	const compiled = formatter.compile(spec);
	spec.locale = "";
	assert.equal(formatter.supports(spec), false);
	assert.equal(compiled.format(61), "0:01:01");
	assert.equal(parser.compile(compiled.spec).parse("0:01:01"), "61");
});

test("duration validation accepts supported fields, omitted values and null-prototype specs", () => {
	const elapsed = Object.assign(Object.create(null), {
		kind: "duration", presentation: "elapsed", locale: "en-AU", inputUnit: "milliseconds",
		roundingMode: "halfEven", signDisplay: "always", negativeDisplay: "parentheses",
		numberingSystem: undefined, style: undefined, fractionalDigits: undefined,
	});
	assert.equal(formatter.compile(elapsed).format(61000), "+0:01:01");
	assert.equal(parser.compile(formatter.compileSeries([], elapsed).spec).parse("+0:01:01"), "61000");
	const localized = {
		...elapsed, presentation: "localized", numberingSystem: "latn", style: "long", fractionalDigits: 2,
	};
	for (const unit of ["years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds", "microseconds", "nanoseconds"]) {
		localized[unit] = "long";
		localized[`${unit}Display`] = "auto";
	}
	assert.equal(formatter.supports(localized), true);
	assert.equal(formatter.compile(localized).format({ hours: 1 }), "+1 hour");
	assert.equal(formatter.format(1, { kind: "duration", presentation: "elapsed", locale: undefined }), "0:00:01");
});

test("validation observes mutable specs while compiled snapshots and custom options remain independent", () => {
	const spec = { kind: "number", maximumFractionDigits: 1 };
	const compiled = formatter.compile(spec);
	spec.maximumFractionDigits = "1";
	assert.equal(formatter.supports(spec), false);
	assert.equal(compiled.format(1.23), "1.2");
	const patterns = { other: "{number}th" };
	const ordinal = Object.freeze({ kind: "ordinal", ordinalPatterns: patterns });
	const bound = formatter.compile(ordinal);
	assert.equal(formatter.supports(ordinal), true);
	patterns.other = "invalid";
	assert.equal(formatter.supports(ordinal), false);
	assert.equal(bound.format(2), "2th");
	const inherited = { one: "{number}st" };
	const inheritedSpec = { kind: "ordinal", ordinalPatterns: Object.freeze(Object.assign(Object.create(inherited), { other: "{number}th" })) };
	assert.equal(formatter.supports(inheritedSpec), true);
	inherited.one = "invalid";
	assert.equal(formatter.supports(inheritedSpec), false);
	const custom = new Formatter({ codecs: [{ kind: "label", format: (value, spec) => [{ type: "literal", value: spec.prefix + value }] }] });
	assert.equal(custom.format("x", { kind: "label", prefix: "!", base: 999 }), "!x");
	assert.equal(formatter.format(1.25, { kind: "number", maximumFractionDigits: undefined }), "1.25");
	assert.equal(formatter.format(1024, { kind: "bytes", byteBase: 1024 }), "1 KiB");
	assert.equal(formatter.format(1000, { kind: "number", compactExponent: 3 }), "1K");
});

test("numeric resolution and compilation do not render validation samples", () => {
	// Feature detection has its own one-time behavioral probes, independent of specs.
	runtimeCapabilities();
	countRendering([Intl.NumberFormat], calls => {
		for (const spec of [
			{ kind: "number" }, { kind: "number", notation: "compact" },
			{ kind: "currency", currency: "USD" }, { kind: "unit", unit: "meter" },
			{ kind: "bytes", byteExponent: 2 }, { kind: "percentage", percentageScale: 10000 },
			{ kind: "ordinal" }, { kind: "ordinal", ordinalPatterns: { other: "{number}th" } },
		]) {
			assert.equal(formatter.supports(spec), true);
			formatter.compile(spec);
			assert.deepEqual(formatter.formatSeries([], spec), []);
		}
		assert.equal(calls(), 0);
		assert.equal(formatter.format(1234, { kind: "number" }), "1,234");
		assert.equal(calls(), 1); // Only the requested value is rendered.
	});
});

test("native duration preparation does not render validation samples", () => {
	runtimeCapabilities();
	countRendering([Intl.NumberFormat, Intl.DurationFormat], calls => {
		for (const style of ["long", "short", "narrow", "digital"]) {
			const spec = { kind: "duration", presentation: "localized", style };
			assert.equal(formatter.supports(spec), true);
			formatter.compile(spec);
			assert.deepEqual(formatter.formatSeries([], spec), []);
		}
		assert.equal(calls(), 0);
	});
	for (const spec of [
		{ kind: "duration", presentation: "localized", hours: "numeric", minutes: "long" },
		{ kind: "duration", presentation: "localized", milliseconds: "numeric", millisecondsDisplay: "always" },
		{ kind: "duration", presentation: "localized", roundingMode: "invalid" },
		{ kind: "duration", presentation: "elapsed", roundingMode: "invalid" },
	]) assertRejected(spec, /./);
});

test("localized duration preparation requires Intl.DurationFormat even for empty collections", () => {
	withProperty(Intl, "DurationFormat", { value: undefined }, () =>
		assertRejected({ kind: "duration", presentation: "localized" }, /Intl.DurationFormat/));
});

test("formatter construction rejects malformed locale values without coercion", () => {
	for (const construct of [options => createFormatter(options), options => new Formatter(options)]) {
		for (const locale of ["", "en_US", "!", null, false, 123, [], ["en-US"], {}, new String("en-US")])
			assert.throws(() => construct({ locale }), RangeError);
		assert.doesNotThrow(() => construct({ locale: undefined }));
		assert.doesNotThrow(() => construct({ locale: "EN-us" }));
	}
	assert.equal(createFormatter().resolve({ kind: "number" }).locale, "en-US");
	assert.equal(createFormatter({ locale: "DE-de" }).format(1234.5, { kind: "number" }), "1.234,5");
});

test("duration presentation is required and cannot be switched implicitly by options", () => {
	const elapsed = { kind: "duration", presentation: "elapsed" };
	const localized = { kind: "duration", presentation: "localized" };
	assert.equal(formatter.format(3661, elapsed), "1:01:01");
	assert.equal(parser.parse("1:01:01", elapsed), "3661");
	assert.equal(formatter.format(3661, localized), "1 hr, 1 min, 1 sec");
	assert.equal(formatter.format({ hours: 1 }, localized), "1 hr");
	assert.equal(formatter.compile(localized).parse, undefined);
	assert.equal(formatter.resolve(localized).capabilities.parse, false);
	assert.throws(() => parser.parse("1 hr", localized), UnsupportedParseError);
	for (const spec of [
		{ kind: "duration" }, { kind: "duration", style: "long" },
		{ kind: "duration", presentation: "invalid" },
		{ ...elapsed, numberingSystem: "latn" }, { ...elapsed, fractionalDigits: 2 },
		{ ...elapsed, style: "digital" }, { ...elapsed, hours: "long" },
	]) {
		assert.equal(formatter.supports(spec), false);
		assert.throws(() => formatter.format(1, spec), RangeError);
		assert.throws(() => formatter.compile(spec), RangeError);
	}
});
