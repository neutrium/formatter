import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { prepareDurationParser } from "../dist/duration/parser.js";
import { parseQuantity } from "../dist/numeric/shared/decimal-string.js";
import { countCalls } from "./helpers/intl-probes.js";

test("ordinary duration parsing performs only one canonical render", () => {
	const context = { locale: "en-US", data: {} };
	const spec = { kind: "duration", presentation: "elapsed" };
	const { parse } = prepareDurationParser(spec, context);
	// Every elapsed render checks finiteness, including special-value probes.
	// Instrument the quantity instead of option reads now that options are bound.
	const prototype = Object.getPrototypeOf(parseQuantity(0));
	for (const [source, expected] of [["0:01:01", "61"], ["-0:01:01", "-61"], ["-0:00:00", "-0"]])
		assert.equal(countCalls(prototype, "isFinite", () => assert.equal(parse(source), expected)), 1);
});

test("duration special-value fallback preserves strict sign policies", () => {
	for (const signDisplay of ["auto", "always", "exceptZero", "negative", "never"]) {
		for (const negativeDisplay of ["sign", "parentheses"]) {
			for (const inputUnit of ["seconds", "milliseconds"]) {
				const spec = { kind: "duration", presentation: "elapsed", signDisplay, negativeDisplay, inputUnit };
				const compiled = parser.compile(spec);
				const accepted = new Map();
				for (const value of ["NaN", "Infinity", "-Infinity"]) {
					const text = formatter.format(value, spec);
					// Hidden signs intentionally resolve to positive infinity first.
					if (!accepted.has(text)) accepted.set(text, value);
				}
				for (const [text, expected] of accepted) {
					assert.equal(parser.parse(text, spec), expected);
					assert.equal(compiled.parse(` \t${text}\n`), expected);
				}
				for (const text of ["NaN", "+NaN", "-NaN", "(NaN)", "Infinity", "+Infinity", "-Infinity", "(Infinity)",
					"(+Infinity)", "Infinity)", "NaN junk", "0:60:00", "00:01:01", "(-0:01:01)"]) {
					if (!accepted.has(text)) assert.throws(() => compiled.parse(text), /Invalid formatted duration/);
				}
			}
		}
	}
});
