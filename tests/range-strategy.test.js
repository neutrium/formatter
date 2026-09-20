import test from "node:test";
import assert from "node:assert/strict";
import { createFormatter } from "@neutrium/formatter";
import { withMethod, withProperty } from "./helpers/intl-probes.js";

test("resolved range strategies dispatch native, conditional and fallback paths", () => {
	const calls = [];
	withMethod(Intl.NumberFormat.prototype, "formatRangeToParts", original => function (...args) {
		calls.push(args);
		return original.apply(this, args);
	}, () => {
		const formatting = createFormatter();
		const native = formatting.compile({ kind: "number" });
		assert.equal(native.resolution.capabilities.rangeImplementation, "native");
		native.formatRange(10, 20);
		assert.deepEqual(calls.splice(0), [["10", "20"]]);

		const conditional = formatting.compile({ kind: "number", negativeDisplay: "parentheses", infinityDisplay: "infinite" });
		assert.equal(conditional.resolution.capabilities.rangeImplementation, "conditional");
		conditional.formatRange(10, 20);
		assert.deepEqual(calls.splice(0), [["10", "20"]]);
		assert.match(conditional.formatRange(-10, 20), /\(10\)/);
		assert.deepEqual(calls.splice(0), [["1", "2"]], "fallback discovers its separator once");
		assert.match(conditional.formatRange(10, Infinity), /infinite/);
		assert.deepEqual(calls.splice(0), []);

		for (const spec of [{ kind: "bytes" }, { kind: "ordinal" },
			{ kind: "number", compactExponent: 3 }, { kind: "number", zeroDisplay: "zero" }]) {
			const fallback = formatting.compile(spec);
			assert.equal(fallback.resolution.capabilities.rangeImplementation, "fallback");
			fallback.formatRange(10, 20);
			assert.deepEqual(calls.splice(0), [["1", "2"]]);
			fallback.formatRange(30, 40);
			assert.deepEqual(calls.splice(0), []);
		}
	});
});

test("a resolved fallback does not upgrade when native ranges become available", () => {
	const compiled = withProperty(Intl.NumberFormat.prototype, "formatRangeToParts", { value: undefined },
		() => createFormatter().compile({ kind: "number" }));
	assert.equal(compiled.resolution.capabilities.rangeImplementation, "fallback");
	const calls = [];
	withMethod(Intl.NumberFormat.prototype, "formatRangeToParts", original => function (...args) {
		calls.push(args);
		return original.apply(this, args);
	}, () => {
		compiled.formatRange(10, 20);
		assert.deepEqual(calls, [["1", "2"]], "native Intl is used only to discover the separator");
	});
});

test("native plans tolerate a missing runtime method and cached separators cannot be mutated through results", () => {
	const compiled = createFormatter().compile({ kind: "number" });
	assert.equal(compiled.resolution.capabilities.rangeImplementation, "native");
	withProperty(Intl.NumberFormat.prototype, "formatRangeToParts", { value: undefined }, () => {
		const parts = compiled.formatRangeToParts(10, 20);
		assert.equal(parts.map(part => part.value).join(""), "10–20");
		parts.find(part => part.source === "shared").value = "changed";
		assert.equal(compiled.formatRange(10, 20), "10–20");
	});
});
