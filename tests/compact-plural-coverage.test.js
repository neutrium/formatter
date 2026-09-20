import test from "node:test";
import assert from "node:assert/strict";
import { formatter, createFormatter } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";

const zeroSpec = {
	kind: "number", locale: "lv", notation: "compact", compactDisplay: "long",
	maximumFractionDigits: 0, roundingIncrement: 25, roundingMode: "ceil",
};

test("zero-only compact plurals retain their magnitude and do not invalidate parser profiles", () => {
	assert.equal(parser.supports(zeroSpec), true);
	// This noncompact input previously failed because a different profile probe
	// encountered an unknown zero-only compact suffix.
	assert.equal(parser.parse("25", zeroSpec), "25");
	const format = formatter.compile(zeroSpec);
	const parse = parser.compile(zeroSpec);
	for (const [exponent, suffix] of [[3, "tūkstošu"], [6, "miljonu"], [9, "miljardu"], [12, "triljonu"]]) {
		const detail = format.formatDetailed(`-1e${exponent}`);
		assert.equal(detail.text, `-0 ${suffix}`);
		assert.equal(detail.roundedValue, "-0");
		assert.deepEqual(detail.scale, { kind: "decimal", exponent });
		assert.equal(parse.parse(detail.text), "-0");
		assert.equal(parse.parse(` \t${detail.text}\n`), "-0");
		assert.deepEqual(formatter.formatDetailed(`-1e${exponent}`, zeroSpec), detail);
	}
	for (const options of [
		{ roundingMode: "floor" }, { negativeDisplay: "parentheses" }, { signDisplay: "never" },
		{ zeroDisplay: "—" }, { minimumFractionDigits: 2, maximumFractionDigits: 2, roundingIncrement: 5000 },
	]) {
		const spec = { ...zeroSpec, ...options };
		for (const value of [1000, -1000, 1000000, -1000000, 0, -0]) {
			const detail = formatter.formatDetailed(value, spec);
			assert.equal(parser.parse(detail.text, spec), detail.roundedValue, JSON.stringify({ value, spec }));
		}
	}
	for (const invalid of ["-00 tūkstošu", "-0.1 tūkstošu", "-0 tūkstošu junk", "-0 unknown"])
		assert.throws(() => parse.parse(invalid), TypeError);
});

test("zero-affix discovery is cached and does not cache real Intl failures", () => {
	const format = createFormatter().compile(zeroSpec);
	const failure = new RangeError("zero probe failure");
	withMethod(Intl.NumberFormat.prototype, "formatToParts", original => function (...args) {
		if (this.resolvedOptions().roundingIncrement === 5) throw failure;
		return original.apply(this, args);
	}, () => assert.throws(() => format.formatDetailed(-1000), error => error === failure));
	assert.equal(format.formatDetailed(-1000).roundedValue, "-0");
	countNumberParts(calls => {
		for (let index = 0; index < 20; index++) assert.equal(format.formatDetailed(-1000).scale.exponent, 3);
		assert.equal(calls(), 20);
	});
});

test("compact number parsing covers the same plural categories for both signs", () => {
	for (const locale of ["sl", "ru", "pl", "cs", "ar", "lv"]) {
		for (const precision of [{ maximumFractionDigits: 1 }, { maximumFractionDigits: 0 }, { maximumSignificantDigits: 2 }]) {
			const spec = { kind: "number", locale, notation: "compact", compactDisplay: "long", ...precision };
			const format = formatter.compile(spec);
			const parse = parser.compile(spec);
			for (const coefficient of [1, 1.1, 1.5, 2, 3, 4, 5, 11, 21, 22, 23.5, 25, 123.5]) {
				for (const sign of [1, -1]) {
					const value = sign * coefficient * 1000000;
					const detail = format.formatDetailed(value);
					assert.equal(parse.parse(detail.text), detail.roundedValue, JSON.stringify({ spec, value, text: detail.text }));
				}
			}
		}
	}
	const spec = { kind: "number", locale: "sl", notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 };
	assert.equal(parser.parse("−2 milijona", spec), "-2000000");
	assert.throws(() => parser.parse("−2 milijona junk", spec), TypeError);
	assert.throws(() => parser.parse("−02 milijona", spec), TypeError);
	for (const options of [{ negativeDisplay: "parentheses" }, { signDisplay: "always" }, { signDisplay: "never" }]) {
		const selected = { ...spec, ...options };
		const detail = formatter.formatDetailed(-2000000, selected);
		assert.equal(parser.parse(detail.text, selected), detail.roundedValue);
	}
});
import { countNumberParts, withMethod } from "./helpers/intl-probes.js";
