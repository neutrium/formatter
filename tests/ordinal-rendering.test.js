import test from "node:test";
import assert from "node:assert/strict";
import { createFormatter } from "@neutrium/formatter";
import { createParser } from "@neutrium/formatter/parse";
import { countNumberParts, withProperty } from "./helpers/intl-probes.js";

test("ordinal grammar uses one parts render and no second string formatter", () => {
	const formatting = createFormatter();
	for (const numberingSystem of ["latn", "arab", "hanidec"]) {
		const compiled = formatting.compile({ kind: "ordinal", numberingSystem });
		compiled.format(0); // Warm digit decoding independently of ordinal rendering.
		withProperty(Intl.NumberFormat.prototype, "format", {
			get() { assert.fail("Ordinal grammar must not render a second number"); },
		}, () => {
			assert.equal(countNumberParts(() => assert.match(compiled.format(21), /st$/)), 1);
			assert.equal(countNumberParts(() => assert.equal(compiled.formatToParts(22).at(-1).value, "nd")), 1);
			assert.equal(countNumberParts(() => assert.equal(compiled.formatDetailed(23).roundedValue, "23")), 1);
		});
	}
});

test("ordinal suffixes follow rounded raw digits across precision, localization and overrides", () => {
	const formatting = createFormatter();
	const parsing = createParser();
	for (const [value, options, suffix, rounded] of [
		["21.5", {}, "nd", "22"],
		["-21.5", { roundingMode: "ceil" }, "st", "-21"],
		["21.24", { minimumFractionDigits: 2, maximumFractionDigits: 2, roundingIncrement: 25 }, "st", "21.25"],
		["22.1", { maximumSignificantDigits: 2 }, "nd", "22"],
		["9007199254740993", {}, "rd", "9007199254740993"],
		["1", { locale: "fr", numberingSystem: "arab" }, "er", "1"],
		["1231.5", { numberingSystem: "hanidec", groupSeparator: "22", decimalSeparator: "33" }, "nd", "1232"],
		["21.25", { maximumFractionDigits: 2, decimalSeparator: "99", numberingSystem: "arab" }, "st", "21.25"],
	]) {
		const spec = { kind: "ordinal", ...options };
		const result = formatting.formatDetailed(value, spec);
		assert.ok(result.text.endsWith(suffix), result.text);
		assert.equal(result.roundedValue, rounded);
		assert.equal(parsing.parse(result.text, spec), rounded);
	}
	assert.equal(formatting.format(0.1, { kind: "ordinal", zeroDisplay: "zero" }), "zero");
	assert.equal(formatting.format(NaN, { kind: "ordinal", nanDisplay: "missing" }), "missing");
});
