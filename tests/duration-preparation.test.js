import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";
import { Formatter, durationCodec } from "@neutrium/formatter/extensions";

test("duration operations capture options once, including inherited and hidden options", () => {
	for (const presentation of ["elapsed", "localized"]) {
		const values = { presentation, inputUnit: "milliseconds", signDisplay: "always", negativeDisplay: "sign",
			...(presentation === "localized" ? { style: "digital", fractionalDigits: 3 } : {}) };
		for (const run of [
			spec => formatter.format(61000, spec),
			spec => formatter.formatToParts(61000, spec),
			spec => formatter.formatDetailed(61000, spec),
			spec => formatter.formatSeries([61000, 61000], spec),
			spec => formatter.formatSeriesToParts([61000, 61000], spec),
			spec => formatter.formatColumn([61000, 61000], spec),
			spec => formatter.resolve(spec),
		]) {
			const reads = {};
			const inherited = {};
			for (const [name, value] of Object.entries(values)) {
				Object.defineProperty(inherited, name, { get() { reads[name] = (reads[name] ?? 0) + 1; return value; } });
			}
			const spec = Object.assign(Object.create(inherited), { kind: "duration" });
			Object.defineProperty(spec, "locale", { get() { reads.locale = (reads.locale ?? 0) + 1; return "en-US"; } });
			run(spec);
			assert.deepEqual(reads, Object.fromEntries([...Object.keys(values), "locale"].map(name => [name, 1])));
		}
	}
});

test("duration rendering and metadata retain the options captured before value conversion", () => {
	for (const presentation of ["elapsed", "localized"]) {
		const original = { kind: "duration", presentation, inputUnit: "milliseconds", signDisplay: "always",
			...(presentation === "localized" ? { style: "digital", fractionalDigits: 3 } : {}) };
		const spec = { ...original };
		const value = { toValue() {
			spec.presentation = "elapsed";
			spec.inputUnit = "seconds";
			spec.signDisplay = "never";
			return "61000";
		} };
		assert.deepEqual(formatter.formatDetailed(value, spec), formatter.formatDetailed("61000", original));
	}
});

test("compiled localized operations reuse their Intl setup and resolution", () => {
	const prototype = Intl.DurationFormat.prototype;
	const descriptor = Object.getOwnPropertyDescriptor(prototype, "resolvedOptions");
	let calls = 0;
	Object.defineProperty(prototype, "resolvedOptions", { ...descriptor, value() {
		calls++;
		return descriptor.value.call(this);
	} });
	try {
		const compiled = formatter.compile({ kind: "duration", presentation: "localized", style: "digital" });
		assert.equal(calls, 1);
		assert.equal(compiled.format(61), "0:01:01");
		assert.equal(renderTokens(compiled.formatToParts(61)), "0:01:01");
		assert.equal(compiled.formatDetailed(61).text, "0:01:01");
		assert.deepEqual(compiled.formatSeries([61, 62]), ["0:01:01", "0:01:02"]);
		assert.deepEqual(compiled.formatColumn([61, 62]), ["0:01:01", "0:01:02"]);
		assert.equal(calls, 1);
	} finally {
		Object.defineProperty(prototype, "resolvedOptions", descriptor);
	}
});

test("caller-frozen durations remain live between operations and codec copies retain custom hooks", () => {
	let inputUnit = "seconds";
	const spec = Object.freeze({ kind: "duration", presentation: "elapsed", get inputUnit() { return inputUnit; } });
	assert.equal(formatter.format(61000, spec), "16:56:40");
	inputUnit = "milliseconds";
	assert.equal(formatter.format(61000, spec), "0:01:01");
	const custom = new Formatter({ codecs: [{ ...durationCodec, formatString: () => "custom" }] });
	assert.equal(custom.format(61, spec), "custom");
	assert.deepEqual(custom.formatSeries([61, 62], spec), ["custom", "custom"]);
});
