import { parser } from "@neutrium/formatter/parse";
import { Parser } from "@neutrium/formatter/extensions/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { createFormatter, formatter, renderTokens } from "@neutrium/formatter";

test("frozen numeric getters refresh formatting, parsing and resolved precision", () => {
	let precision = 2;
	const spec = Object.freeze({ kind: "number", get maximumFractionDigits() { return precision; } });
	assert.equal(formatter.format(1.234, spec), "1.23");
	assert.equal(parser.parse("1.23", spec), "1.23");
	precision = 0;
	assert.equal(formatter.format(1.234, spec), "1");
	assert.equal(renderTokens(formatter.formatToParts(1.234, spec)), "1");
	assert.deepEqual(formatter.formatSeries([1.234], spec), ["1"]);
	assert.deepEqual(formatter.formatColumn([1.234], spec), ["1"]);
	assert.equal(formatter.formatRange(1.234, 2.345, spec), formatter.formatRange(1.234, 2.345, { kind: "number", maximumFractionDigits: 0 }));
	const detailed = formatter.formatDetailed(1.234, spec);
	assert.equal(detailed.text, "1");
	assert.equal(detailed.roundedValue, "1");
	for (const resolution of [formatter.resolve(spec), detailed.resolution]) {
		assert.equal(resolution.intl.requestedOptions.maximumFractionDigits, 0);
		assert.equal(resolution.intl.resolvedOptions.maximumFractionDigits, 0);
	}
	assert.equal(parser.parse("1", spec), "1");
	assert.throws(() => parser.parse("1.23", spec));
});

test("parse cache keys observe inherited and non-enumerable options", () => {
	for (const inherited of [false, true]) {
		let zero = "before";
		const options = Object.defineProperty({}, "zeroDisplay", { get: () => zero });
		const spec = Object.freeze(Object.assign(inherited ? Object.create(options) : options, { kind: "number" }));
		assert.equal(parser.parse("before", spec), "0");
		zero = "after";
		assert.equal(formatter.format(0, spec), "after");
		assert.equal(parser.parse("after", spec), "0");
		assert.throws(() => parser.parse("before", spec));
	}
	const prototype = { locale: "en-US" };
	const spec = Object.freeze(Object.assign(Object.create(prototype), { kind: "number" }));
	assert.equal(parser.parse("1,234.5", spec), "1234.5");
	prototype.locale = "de-DE";
	assert.equal(formatter.format(1234.5, spec), "1.234,5");
	assert.equal(parser.parse("1.234,5", spec), "1234.5");
	assert.throws(() => parser.parse("1,234.5", spec));
	const customSerialization = Object.freeze(Object.assign(Object.create({
		toJSON() { assert.fail("Parser cache keys must not invoke caller serialization"); },
	}), { kind: "number", zeroDisplay: "zero" }));
	assert.equal(parser.parse("zero", customSerialization), "0");
});

test("frozen compact getters and inherited series options select current affixes", () => {
	let display = "short";
	const spec = Object.freeze({ kind: "number", compactExponent: 3, get compactDisplay() { return display; } });
	assert.equal(formatter.format(2000, spec), "2K");
	assert.equal(parser.parse("2K", spec), "2000");
	display = "long";
	assert.equal(formatter.format(2000, spec), "2 thousand");
	assert.equal(parser.parse("2 thousand", spec), "2000");
	assert.throws(() => parser.parse("2K", spec));
	for (const own of [{ kind: "number", notation: "compact" }, { kind: "bytes" }]) {
		const prototype = { locale: "en-US", maximumFractionDigits: 1 };
		const inherited = Object.freeze(Object.assign(Object.create(prototype), own));
		formatter.formatSeries([1234, 2345], inherited);
		prototype.locale = "de-DE";
		prototype.maximumFractionDigits = 0;
		assert.deepEqual(formatter.formatSeries([1234, 2345], inherited), formatter.formatSeries([1234, 2345], { ...own, ...prototype }));
	}
});

test("ordinal caches refresh rounded categories and nested pattern values", () => {
	let precision = 1;
	const spec = Object.freeze({ kind: "ordinal", get maximumFractionDigits() { return precision; } });
	assert.equal(formatter.format(1.6, spec), "1.6st");
	precision = 0;
	assert.equal(formatter.format(1.6, spec), "2nd");
	for (const mode of ["mutable", "getter", "inherited"]) {
		let suffix = "a";
		const parent = { other: "{number}a" };
		const patterns = mode === "mutable" ? parent : mode === "inherited"
			? Object.freeze(Object.create(parent)) : Object.freeze({ get other() { return `{number}${suffix}`; } });
		const ordinal = Object.freeze({ kind: "ordinal", ordinalPatterns: patterns });
		assert.equal(parser.parse("4a", ordinal), "4");
		parent.other = "{number}b";
		suffix = "b";
		assert.equal(formatter.format(4, ordinal), "4b");
		assert.equal(parser.parse("4b", ordinal), "4");
		assert.throws(() => parser.parse("4a", ordinal));
		parent.other = "invalid";
		suffix = "{number}";
		assert.equal(formatter.supports(ordinal), false);
		assert.throws(() => formatter.format(4, ordinal), /ordinal pattern/i);
	}
});

function checkDurationCaches() {
	for (const inherited of [false, true]) {
		let style = "long";
		const options = { get style() { return style; } };
		const spec = Object.freeze(Object.assign(inherited ? Object.create(options) : options, { kind: "duration", presentation: "localized" }));
		assert.equal(formatter.format(3661, spec), "1 hour, 1 minute, 1 second");
		style = "digital";
		assert.equal(formatter.format(3661, spec), "1:01:01");
		assert.equal(renderTokens(formatter.formatToParts(3661, spec)), "1:01:01");
		assert.equal(formatter.formatDetailed(3661, spec).text, "1:01:01");
		assert.deepEqual(formatter.formatSeries([3661], spec), ["1:01:01"]);
		const resolution = formatter.resolve(spec);
		if (resolution.intl) {
			assert.equal(resolution.intl.requestedOptions.style, "digital");
			assert.equal(resolution.intl.resolvedOptions.style, "digital");
		}
		style = "invalid";
		assert.equal(formatter.supports(spec), false);
		assert.throws(() => formatter.format(3661, spec), RangeError);
	}
	let display = "auto";
	const spec = Object.freeze({ kind: "duration", presentation: "localized", style: "digital", get hoursDisplay() { return display; } });
	assert.equal(formatter.format(61, spec), "01:01");
	display = "always";
	assert.equal(formatter.format(61, spec), "0:01:01");
	let minutes;
	const sequence = Object.freeze({ kind: "duration", presentation: "localized", hours: "numeric", get minutes() { return minutes; } });
	assert.equal(formatter.supports(sequence), true);
	minutes = "long";
	assert.equal(formatter.supports(sequence), false);
	assert.throws(() => formatter.formatSeries([], sequence), RangeError);
}

test("native duration caches observe changing frozen options", { skip: typeof Intl.DurationFormat !== "function" }, checkDurationCaches);

test("frozen elapsed specs are revalidated across operations", () => {
	let negativeDisplay = "sign";
	const spec = Object.freeze({ kind: "duration", presentation: "elapsed", get negativeDisplay() { return negativeDisplay; } });
	assert.equal(parser.parse("0:00:01", spec), "1");
	negativeDisplay = "invalid";
	assert.equal(formatter.supports(spec), false);
	for (const run of [
		() => formatter.format(1, spec), () => formatter.formatToParts(1, spec),
		() => formatter.formatDetailed(1, spec), () => parser.parse("0:00:01", spec),
		() => formatter.formatSeries([], spec), () => formatter.formatColumn([], spec),
	]) assert.throws(run, /negativeDisplay/);
});

test("compiled snapshots keep independent options, nested patterns and locale contexts", () => {
	const patterns = { other: "{number}a" };
	const spec = Object.freeze({ kind: "ordinal", ordinalPatterns: patterns });
	const compiled = formatter.compile(spec);
	assert.equal(parser.compile(compiled.spec).parse("4a"), "4");
	patterns.other = "{number}b";
	assert.equal(parser.parse("4b", spec), "4");
	assert.equal(compiled.format(4), "4a");
	assert.equal(parser.compile(compiled.spec).parse("4a"), "4");
	assert.equal(formatter.format(4, compiled.spec), "4a");
	const number = formatter.compile({ kind: "number" });
	assert.equal(number.format(1234.5), "1,234.5");
	assert.equal(createFormatter({ locale: "de-DE" }).format(1234.5, number.spec), "1,234.5");
});

test("compiled specs retain identity-cache reuse after value-cache eviction", () => {
	const instance = createFormatter();
	const compiled = instance.compile({ kind: "number", maximumFractionDigits: 2 });
	assert.equal(compiled.format(1.234), "1.23");
	// More than the 256-entry Intl value cache can retain.
	for (let minimumIntegerDigits = 1; minimumIntegerDigits <= 21; minimumIntegerDigits++)
		for (let maximumFractionDigits = 0; maximumFractionDigits <= 20; maximumFractionDigits++)
			instance.format(1, { kind: "number", minimumIntegerDigits, maximumFractionDigits });
	const Native = Intl.NumberFormat;
	withProperty(Intl, "NumberFormat", { value: class extends Native {
		constructor() { assert.fail("The compiled spec should reuse its cached Intl formatter"); }
	} }, () => {
		assert.equal(compiled.format(1.234), "1.23");
		assert.equal(instance.format(1.234, compiled.spec), "1.23");
	});
});
import { withProperty } from "./helpers/intl-probes.js";
test("compiled accounting variants preserve non-enumerable numeric options", () => {
	for (const [hidden, value, expected] of [
		[{ currency: "USD" }, -1.25, "($1.25)"],
		[{ maximumFractionDigits: 0 }, -1.25, "($1)"],
		[{ compactExponent: 3 }, -1250, "($1.25K)"],
		[{ currencySymbol: "money" }, -1.25, "(money1.25)"],
	]) {
		const spec = { kind: "currency", currency: "USD", currencySign: "accounting", negativeDisplay: "parentheses" };
		for (const [key, value] of Object.entries(hidden))
			Object.defineProperty(spec, key, { value, enumerable: false });
		const compiled = formatter.compile(spec);
		for (const format of [
			input => formatter.format(input, spec), compiled.format,
			input => compiled.formatToParts(input).map(part => part.value).join(""),
			input => compiled.formatDetailed(input).text,
		]) assert.equal(format(value), expected);
		assert.equal(parser.compile(compiled.spec).parse(expected), compiled.formatDetailed(value).roundedValue);
		assert.equal(compiled.format(-value), expected.slice(1, -1));
		assert.equal(compiled.format(value), expected, "The warmed variant retains all options too");
	}
});
