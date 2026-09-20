import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";
import { normalizeDurationSpec, durationFormatOptions } from "../dist/duration/options.js";

const groups = [
	[["years", "months", "weeks", "days"], ["long", "short", "narrow"]],
	[["hours", "minutes", "seconds"], ["long", "short", "narrow", "numeric", "2-digit"]],
	[["milliseconds", "microseconds", "nanoseconds"], ["long", "short", "narrow", "numeric"]],
];
const localized = { numberingSystem: "latn", style: "long", fractionalDigits: 2 };
for (const [units] of groups) for (const unit of units) {
	localized[unit] = "long";
	localized[`${unit}Display`] = "auto";
}
const wrapper = {
	kind: "duration", presentation: "localized", locale: "en-GB", inputUnit: "milliseconds",
	roundingMode: "halfEven", signDisplay: "always", negativeDisplay: "parentheses",
};

test("duration descriptors forward all localized options and exclude wrapper options", () => {
	const spec = { ...wrapper, ...localized };
	assert.deepEqual(durationFormatOptions(normalizeDurationSpec(spec)), localized);
	const compiled = formatter.compile(spec);
	assert.deepEqual(compiled.resolution.intl.requestedOptions, localized);
	assert.equal(compiled.format({ hours: 1 }), "+1 hour");
	const expected = new Intl.DurationFormat(wrapper.locale, localized).resolvedOptions();
	assert.deepEqual(compiled.resolution.intl.resolvedOptions, expected);
});

test("duration descriptors capture every inherited and non-enumerable option once", () => {
	const values = { ...wrapper, ...localized };
	const prototype = {};
	const spec = Object.assign(Object.create(prototype), { kind: "duration" });
	const reads = {};
	for (const [name, value] of Object.entries(values)) {
		if (name === "kind") continue;
		Object.defineProperty(Object.keys(reads).length % 2 ? spec : prototype, name, { get() {
			assert.equal(++reads[name], 1, name);
			return value;
		} });
		reads[name] = 0;
	}
	const result = formatter.formatDetailed({ hours: 1 }, spec);
	assert.equal(result.text, "+1 hour");
	assert.deepEqual(result.resolution.intl.requestedOptions, localized);
	assert.ok(Object.values(reads).every(count => count === 1));
});

test("duration component descriptors enforce their distinct styles and display values", () => {
	for (const [units, styles] of groups) for (const unit of units) {
		for (const value of styles) {
			const spec = normalizeDurationSpec({ ...wrapper, [unit]: value });
			assert.deepEqual(durationFormatOptions(spec), { [unit]: value });
		}
		for (const value of ["auto", "always"])
			assert.deepEqual(durationFormatOptions(normalizeDurationSpec({ ...wrapper, [`${unit}Display`]: value })), { [`${unit}Display`]: value });
		for (const value of [null, true, 0, {}, "digital", "invalid", ...["numeric", "2-digit"].filter(value => !styles.includes(value))])
			assert.throws(() => normalizeDurationSpec({ ...wrapper, [unit]: value }), new RegExp(`option: ${unit}$`));
		for (const value of [null, true, 0, {}, "never", "long"])
			assert.throws(() => normalizeDurationSpec({ ...wrapper, [`${unit}Display`]: value }), new RegExp(`option: ${unit}Display$`));
	}
});

test("every forwarded duration option requires localized presentation and omissions stay omitted", () => {
	for (const [name, value] of Object.entries(localized)) {
		assert.throws(() => normalizeDurationSpec({ kind: "duration", presentation: "elapsed", [name]: value }), /requires localized/);
		for (const presentation of ["elapsed", "localized"])
			assert.deepEqual(durationFormatOptions(normalizeDurationSpec({ kind: "duration", presentation, [name]: undefined })), {});
	}
	for (const fractionalDigits of [0, 9])
		assert.deepEqual(durationFormatOptions(normalizeDurationSpec({ ...wrapper, fractionalDigits })), { fractionalDigits });
	for (const fractionalDigits of [-1, 10, 1.5, NaN, Infinity, "2", null])
		assert.throws(() => normalizeDurationSpec({ ...wrapper, fractionalDigits }), /option: fractionalDigits/);
	const normalized = normalizeDurationSpec({ ...wrapper, style: "digital" });
	assert.ok(Object.isFrozen(normalized));
	const mapped = durationFormatOptions(normalized);
	mapped.style = "long";
	assert.deepEqual(durationFormatOptions(normalized), { style: "digital" });
});
