import test from "node:test";
import assert from "node:assert/strict";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";
import { formatElapsedDuration, formatElapsedDurationDetailed } from "../dist/duration/elapsed.js";

test("elapsed metadata reports the rounded quantity with the displayed sign and input unit", () => {
	const cases = [
		["61.5", "62"], ["-61.5", "-62"], ["-0.1", "-0"], ["-0", "-0"], ["0", "0"],
		["123456789012345678901234567890.9", "123456789012345678901234567891"],
		["-123456789012345678901234567890.9", "-123456789012345678901234567891"],
		["NaN", "NaN"], ["Infinity", "Infinity"], ["-Infinity", "-Infinity"],
	];
	for (const inputUnit of ["seconds", "milliseconds"]) {
		for (const signDisplay of ["auto", "always", "exceptZero", "negative", "never"]) {
			for (const negativeDisplay of ["sign", "parentheses"]) {
				const spec = { kind: "duration", presentation: "elapsed", inputUnit, signDisplay, negativeDisplay };
				const compiled = formatter.compile(spec);
				for (const [seconds, roundedSeconds] of cases) {
					const finite = !seconds.includes("Infinity") && seconds !== "NaN";
					const value = inputUnit === "milliseconds" && finite ? seconds + "e3" : seconds;
					let expected = roundedSeconds;
					if (signDisplay === "never" || (expected === "-0" && ["negative", "exceptZero"].includes(signDisplay)))
						expected = expected.replace(/^-/, "");
					if (inputUnit === "milliseconds" && finite && !["0", "-0"].includes(expected)) expected += "000";
					for (const detailed of [formatter.formatDetailed(value, spec), compiled.formatDetailed(value)]) {
						assert.equal(detailed.roundedValue, expected, JSON.stringify({ spec, value }));
						assert.equal(detailed.text, formatter.format(value, spec));
						assert.equal(renderTokens(detailed.parts), detailed.text);
						assert.equal(parser.parse(detailed.text, spec), expected);
					}
				}
			}
		}
	}
});

test("elapsed metadata uses the same rounding decision as the rendered components", () => {
	for (const [roundingMode, positive, negative] of [
		["ceil", "3", "-2"], ["floor", "2", "-3"], ["expand", "3", "-3"], ["trunc", "2", "-2"],
		["halfCeil", "3", "-2"], ["halfFloor", "2", "-3"], ["halfExpand", "3", "-3"],
		["halfTrunc", "2", "-2"], ["halfEven", "2", "-2"],
	]) {
		const spec = { kind: "duration", presentation: "elapsed", roundingMode };
		for (const [value, expected] of [["2.5", positive], ["-2.5", negative]]) {
			const result = formatter.formatDetailed(value, spec);
			assert.equal(result.roundedValue, expected);
			assert.equal(parser.parse(result.text, spec), expected);
		}
	}
});

test("elapsed details convert the input once and do not reconstruct BigInts from tokens", () => {
	const spec = { kind: "duration", presentation: "elapsed", inputUnit: "milliseconds", negativeDisplay: "parentheses" };
	let reads = 0;
	const value = { toValue() { reads++; return "-3661125"; } };
	countCalls(globalThis, "BigInt", conversions => {
		const parts = formatElapsedDuration(value, spec);
		assert.equal(conversions(), 1, "ordinary rendering converts the rounded seconds once");
		reads = 0;
		const detailed = formatElapsedDurationDetailed(value, spec);
		assert.equal(conversions(), 2, "detailed rendering must not reparse the three component tokens");
		assert.equal(reads, 1);
		assert.deepEqual(detailed.parts, parts);
		assert.equal(detailed.roundedValue, "-3661000");
	});
});
import { countCalls } from "./helpers/intl-probes.js";
