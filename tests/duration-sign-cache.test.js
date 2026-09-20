import test from "node:test";
import assert from "node:assert/strict";
import { formatter, createFormatter, renderTokens } from "@neutrium/formatter";

import { countNumberParts, withProperty } from "./helpers/intl-probes.js";

test("localized signs are probed once per sign and reused across operations and instances", () => {
	const spec = { kind: "duration", presentation: "localized", style: "digital", locale: "en-US-x-signs", signDisplay: "always" };
	const compiled = formatter.compile(spec);
	const values = Array(1000).fill(-61);
	assert.equal(countNumberParts(() => {
		assert.deepEqual(compiled.formatSeries(values), Array(1000).fill("-0:01:01"));
	}), 1);
	assert.equal(countNumberParts(() => assert.equal(compiled.format(61), "+0:01:01")), 1);
	const second = createFormatter().compile(spec);
	assert.equal(countNumberParts(() => {
		for (const value of [-61, 61]) {
			const expected = value < 0 ? "-0:01:01" : "+0:01:01";
			assert.equal(formatter.format(value, spec), expected);
			assert.equal(renderTokens(compiled.formatToParts(value)), expected);
			assert.equal(compiled.formatDetailed(value).text, expected);
			assert.equal(second.format(value), expected);
			assert.equal(renderTokens(compiled.formatSeriesToParts([value])[0]), expected);
			assert.deepEqual(compiled.formatColumn([value]), [expected]);
		}
	}), 0);
});

test("sign caches distinguish locales and numbering systems and preserve bidi literals", () => {
	for (const locale of ["en-US", "ar-EG", "fa", "fi-FI"]) for (const numberingSystem of ["latn", "arab"]) {
		const spec = { kind: "duration", presentation: "localized", style: "digital", locale, numberingSystem, signDisplay: "always" };
		const compiled = formatter.compile(spec);
		for (const negative of [true, false]) {
			const raw = new Intl.NumberFormat(locale, { numberingSystem, signDisplay: "always", useGrouping: false }).formatToParts(negative ? -1 : 1);
			const prefix = raw.slice(0, raw.findIndex(part => part.type === "integer")).map(part => ({
				type: ["minusSign", "plusSign"].includes(part.type) ? "sign" : "literal", value: part.value,
			}));
			const body = new Intl.DurationFormat(locale, { style: "digital", numberingSystem }).format({ minutes: 1, seconds: 1 });
			const expected = renderTokens(prefix) + body;
			const value = negative ? -61 : 61;
			assert.equal(compiled.format(value), expected);
			assert.deepEqual(compiled.formatToParts(value).slice(0, prefix.length), prefix);
			assert.equal(countNumberParts(() => assert.equal(compiled.format(value), expected)), 0);
		}
	}
});

test("mutating returned sign and bidi tokens cannot poison cached duration signs", () => {
	const spec = { kind: "duration", presentation: "localized", style: "digital", locale: "ar-EG", signDisplay: "always" };
	const compiled = formatter.compile(spec);
	for (const value of [-61, 61]) {
		const expected = compiled.format(value);
		for (const parts of [compiled.formatToParts(value), compiled.formatDetailed(value).parts,
			compiled.formatSeriesToParts([value])[0]]) {
			for (const part of parts) { part.type = "corrupted"; part.value = "corrupted"; }
			assert.equal(compiled.format(value), expected);
			assert.equal(renderTokens(compiled.formatToParts(value)), expected);
			assert.equal(formatter.format(value, spec), expected);
		}
	}
});

test("signless presentations do not probe signs and transient failures remain retryable", () => {
	const spec = { kind: "duration", presentation: "localized", style: "digital", locale: "en-US-x-retry" };
	formatter.compile(spec);
	assert.equal(countNumberParts(() => {
		assert.equal(formatter.format(61, spec), "0:01:01");
		assert.equal(formatter.format(-61, { ...spec, signDisplay: "never" }), "0:01:01");
		assert.equal(formatter.format(-61, { ...spec, negativeDisplay: "parentheses" }), "(0:01:01)");
		assert.equal(formatter.format(-0, { ...spec, signDisplay: "negative" }), "0:00:00");
	}), 0);
	const failure = new RangeError("temporary sign probe failure");
	withProperty(Intl.NumberFormat.prototype, "formatToParts", { value: () => { throw failure; } },
		() => assert.throws(() => formatter.format(-61, spec), error => error === failure));
	assert.equal(countNumberParts(() => assert.equal(formatter.format(-61, spec), "-0:01:01")), 1);
	assert.equal(countNumberParts(() => assert.equal(formatter.format(-61, spec), "-0:01:01")), 0);
});

test("localized sign cache evicts old entries instead of growing without bound", () => {
	const spec = { kind: "duration", presentation: "localized", style: "digital", locale: "en-US-x-oldsign" };
	const compiled = formatter.compile(spec);
	compiled.format(-1);
	for (let index = 0; index < 128; index++) {
		formatter.format(-1, { ...spec, locale: `en-US-x-s${index}` });
	}
	assert.equal(countNumberParts(() => assert.equal(compiled.format(-1), "-0:00:01")), 1);
	assert.equal(countNumberParts(() => assert.equal(compiled.format(-1), "-0:00:01")), 0);
});
