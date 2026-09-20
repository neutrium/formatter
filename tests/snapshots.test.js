import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { Formatter } from "@neutrium/formatter/extensions";
import { formatter as builtInFormatter, renderTokens, formatter } from "@neutrium/formatter";

test("compiles an immutable reusable built-in formatter", () => {
	const spec = { kind: "number", maximumFractionDigits: 2 };
	const formatter = builtInFormatter.compile(spec);
	spec.maximumFractionDigits = 0;
	assert.deepEqual(formatter.spec, { kind: "number", maximumFractionDigits: 2, locale: "en-US" });
	assert.equal(formatter.format("1.234"), "1.23");
	assert.equal(parser.compile(formatter.spec).parse("1.23"), "1.23");
	assert.equal(formatter.formatRange(1.2, 2.3), "1.2–2.3");
	assert.equal(renderTokens(formatter.formatToParts(1.2)), "1.2");
	assert.ok(Object.isFrozen(formatter));
	assert.ok(Object.isFrozen(formatter.spec));
	const patterns = { other: "No. {number}" };
	const ordinal = builtInFormatter.compile({ kind: "ordinal", ordinalPatterns: patterns });
	patterns.other = "#{number}";
	assert.equal(ordinal.format(2), "No. 2");
	assert.ok(Object.isFrozen(ordinal.spec.ordinalPatterns));
});

test("compiled null-prototype specifications are detached and frozen", () => {
	const spec = Object.assign(Object.create(null), { kind: "number", maximumFractionDigits: 1 });
	const compiled = formatter.compile(spec);
	assert.equal(compiled.format(1.23), "1.2");
	spec.maximumFractionDigits = 0;
	assert.notEqual(compiled.spec, spec);
	assert.equal(Object.getPrototypeOf(compiled.spec), null);
	assert.ok(Object.isFrozen(compiled.spec));
	assert.equal(compiled.format(1.23), "1.2");
});

test("snapshots preserve nested records, cycles, symbols, sparse arrays and own __proto__ data", () => {
	const key = Symbol("metadata");
	const nested = Object.assign(Object.create(null), { label: "before" });
	const spec = { kind: "custom", nested, array: [, nested], [key]: nested };
	spec.self = spec;
	Object.defineProperty(spec, "hidden", { value: nested });
	Object.defineProperty(spec, "__proto__", { value: nested, enumerable: true });
	const custom = new Formatter({ codecs: [{ kind: "custom", format: (_, options) => [{ type: "literal", value: options.nested.label }] }] });
	const compiled = custom.compile(spec);
	nested.label = "after";
	assert.equal(compiled.format(null), "before");
	assert.equal(compiled.spec.self, compiled.spec);
	assert.equal(compiled.spec[key], compiled.spec.nested);
	assert.equal(compiled.spec.hidden, compiled.spec.nested);
	assert.equal(compiled.spec.__proto__, compiled.spec.nested);
	assert.equal(Object.getPrototypeOf(compiled.spec), Object.prototype);
	assert.equal(0 in compiled.spec.array, false);
	assert.equal(compiled.spec.array[1], compiled.spec.nested);
	assert.ok(Object.isFrozen(compiled.spec.array));
	assert.ok(Object.isFrozen(compiled.spec.nested));
});

test("compilation rejects mutable non-record objects and functions instead of retaining references", () => {
	class Options { maximumFractionDigits = 1; kind = "number"; }
	class CustomArray extends Array {}
	assert.throws(() => formatter.compile(new Options()), TypeError);
	for (const extra of [new Date(), new Map(), new Set(), new Uint8Array(1), new CustomArray(), () => 1])
		assert.throws(() => formatter.compile({ kind: "number", extra }), TypeError);
	let reads = 0;
	assert.throws(() => formatter.compile({ kind: "number", get maximumFractionDigits() { reads++; return 1; } }), /accessor/);
	assert.equal(reads, 0);
});
