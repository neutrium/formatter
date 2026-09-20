import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { countNumberParts, withProperty } from "./helpers/intl-probes.js";

test("warm fixed compact grammar reuses its parts render without a second string render", () => {
	for (const domain of [
		{ kind: "number" },
		{ kind: "currency", currency: "USD", currencyDisplay: "name" },
		{ kind: "unit", unit: "meter", unitDisplay: "long" },
	]) {
		for (const numberingSystem of ["latn", "arab", "hanidec"]) {
			const compiled = formatter.compile({ ...domain, locale: "ru", numberingSystem, compactExponent: 3,
				compactDisplay: "long", minimumFractionDigits: 2, maximumFractionDigits: 2, roundingIncrement: 25 });
			const values = ["0", "-1250", "1234567.89"];
			// Warm grammar discovery and digit decoding separately from steady-state rendering.
			const expected = values.map(value => compiled.formatDetailed(value));
			withProperty(Intl.NumberFormat.prototype, "format", {
				get() { assert.fail("Compact grammar must not format a second coefficient"); },
			}, () => {
				for (let index = 0; index < values.length; index++) {
					const value = values[index];
					assert.equal(countNumberParts(() => assert.equal(compiled.format(value), expected[index].text)), 1);
					assert.equal(countNumberParts(() => assert.deepEqual(compiled.formatToParts(value), expected[index].parts)), 1);
					assert.equal(countNumberParts(() => assert.deepEqual(compiled.formatDetailed(value), expected[index])), 1);
				}
				assert.equal(countNumberParts(() => assert.deepEqual(compiled.formatSeries(values), expected.map(value => value.text))), values.length);
			});
		}
	}
});

test("compact grammar reads before separator overrides and retains visible fractional zeros", () => {
	for (const locale of ["ru", "lv", "ar"]) {
		for (const precision of [
			{ minimumFractionDigits: 2, maximumFractionDigits: 2 },
			{ minimumFractionDigits: 2, maximumFractionDigits: 2, roundingIncrement: 25 },
			{ minimumSignificantDigits: 3, maximumSignificantDigits: 3 },
		]) {
			const spec = { kind: "number", locale, numberingSystem: "arab", compactExponent: 3, compactDisplay: "long",
				minimumIntegerDigits: 3, ...precision };
			const overridden = { ...spec, decimalSeparator: "99", groupSeparator: "88" };
			for (const value of ["0", "-1250", "1234567.89"]) {
				const original = formatter.formatDetailed(value, spec);
				const actual = formatter.formatDetailed(value, overridden);
				assert.equal(actual.roundedValue, original.roundedValue);
				assert.deepEqual(actual.scale, original.scale);
				assert.deepEqual(actual.parts, original.parts.map(part => part.type === "decimal" ? { ...part, value: "99" }
					: part.type === "group" ? { ...part, value: "88" } : part));
				assert.equal(parser.parse(actual.text, overridden), original.roundedValue);
			}
		}
	}
});

test("compact unit grammar retains the shared fallback for omitted singular and dual numerals", () => {
	const spec = { kind: "unit", unit: "meter", unitDisplay: "short", locale: "ar", compactExponent: 3,
		compactDisplay: "long", maximumFractionDigits: 1 };
	const native = new Intl.NumberFormat("ar", { style: "unit", unit: "meter", unitDisplay: "short" });
	assert.equal(native.formatToParts(1).some(part => part.type === "integer"), false);
	assert.equal(native.formatToParts(2).some(part => part.type === "integer"), false);
	for (const options of [{}, { negativeDisplay: "parentheses", unitSymbol: "distance" }]) {
		const compiled = formatter.compile({ ...spec, ...options });
		for (const value of [1000, 2000, -1000, -2000]) {
			const detailed = compiled.formatDetailed(value);
			assert.equal(detailed.roundedValue, String(value));
			assert.equal(detailed.scale.exponent, 3);
			assert.equal(compiled.format(value), detailed.text);
			assert.equal(parser.parse(detailed.text, compiled.spec), String(value));
		}
	}
});
