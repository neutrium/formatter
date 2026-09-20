import { countNumberParts, withMethod } from "./helpers/intl-probes.js";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter } from "@neutrium/formatter";

test("warm compact series cache unsupported exponents without repeating Intl probes", () => {
	const compiled = formatter.compile({ kind: "number", notation: "compact" });
	assert.deepEqual(compiled.formatSeries([1e12]), ["1T"]);
	for (let repeat = 0; repeat < 3; repeat++) {
		const calls = countNumberParts(() => {
			assert.deepEqual(compiled.formatSeries([1e12]), ["1T"]);
		});
		assert.equal(calls, 1); // Only render the requested coefficient; no discovery probes.
	}
	assert.throws(() => formatter.compile({ kind: "number", compactExponent: 1 }), /compact magnitude/);
});

test("compact selection propagates real RangeErrors and does not cache failures", () => {
	const spec = { kind: "number", notation: "compact", locale: "en-NZ", maximumFractionDigits: 7 };
	const compiled = formatter.compile(spec);
	const failure = new RangeError("Intl probe failed");
	let failures = 0;
	withMethod(Intl.NumberFormat.prototype, "formatToParts", original => function (value) {
		if (value === "2E1") { failures++; throw failure; }
		return original.call(this, value);
	}, () => {
		assert.throws(() => compiled.formatSeries([1000]), error => error === failure);
		assert.throws(() => formatter.compileSeries([1000], spec), error => error === failure);
		assert.equal(failures, 2);
	});
	assert.deepEqual(compiled.formatSeries([1000]), ["1K"]);
});

test("warm compact metadata reuses neutral scale probes", () => {
	const compiled = formatter.compile({ kind: "number", notation: "compact", roundingIncrement: 100, maximumFractionDigits: 0, roundingMode: "ceil" });
	compiled.formatDetailed(1000);
	countNumberParts(getCalls => {
		for (let index = 0; index < 20; index++) assert.equal(compiled.formatDetailed(1000 + index).roundedValue, "100000");
		assert.equal(getCalls(), 20);
	});
});
