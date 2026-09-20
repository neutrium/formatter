import test from "node:test";
import assert from "node:assert/strict";
import { Formatter } from "@neutrium/formatter/extensions";
import { createFormatter, formatter } from "@neutrium/formatter";
import { parser, createParser } from "@neutrium/formatter/parse";
import { Parser } from "@neutrium/formatter/extensions/parse";
import { countCalls } from "./helpers/intl-probes.js";

test("numeric preparation reads inherited and non-enumerable options once", () => {
	const reads = {};
	const options = { locale: "de-DE", currency: "EUR", maximumFractionDigits: 1 };
	const prototype = {};
	for (const [key, value] of Object.entries(options))
		Object.defineProperty(prototype, key, { get() {
			reads[key] = (reads[key] ?? 0) + 1;
			return reads[key] === 1 ? value : null;
		} });
	const spec = Object.assign(Object.create(prototype), { kind: "currency" });
	assert.equal(formatter.format(1.23, spec), "1,2 €");
	assert.deepEqual(reads, { locale: 1, maximumFractionDigits: 1, currency: 1 });
});

test("normalization owns ordinal patterns before domain validation and rendering", () => {
	let reads = 0;
	const patterns = Object.create({ get other() { reads++; return "{number}th"; } });
	assert.equal(formatter.format(4, { kind: "ordinal", ordinalPatterns: patterns }), "4th");
	assert.equal(reads, 1);
	assert.throws(() => formatter.format(4, {
		kind: "ordinal", ordinalPatterns: { other() {} },
	}), error => error instanceof RangeError && /other pattern/.test(error.message));
});

test("normalization propagates caller getter errors without reconstruction", () => {
	const failure = new SyntaxError("option getter failed");
	const spec = { kind: "number", get maximumFractionDigits() { throw failure; } };
	assert.throws(() => formatter.format(1, spec), error => error === failure);
});

test("compiled numeric execution retains Intl options across operations", () => {
	const compiled = formatter.compile({ kind: "number", maximumFractionDigits: 2 });
	// Warm lazy locale digit metadata; execution itself was prepared at compilation.
	compiled.formatDetailed(1.25);
	countCalls(Intl.NumberFormat.prototype, "resolvedOptions", calls => {
		for (let index = 0; index < 10; index++) {
			assert.equal(compiled.format(1.25), "1.25");
			assert.equal(compiled.formatDetailed(1.25).roundedValue, "1.25");
			assert.deepEqual(compiled.formatSeries([1.25, 2.5]), ["1.25", "2.5"]);
			assert.equal(compiled.formatToParts(1.25).map(part => part.value).join(""), "1.25");
			compiled.formatRange(1.25, 2.5);
		}
		assert.equal(calls(), 0);
	});
});

test("numeric execution captures options before converting the input", () => {
	const spec = { kind: "number", maximumFractionDigits: 1 };
	const input = { toValue() { spec.maximumFractionDigits = 3; return "1.234"; } };
	assert.equal(formatter.format(input, spec), "1.2");
	assert.equal(formatter.format(1.234, spec), "1.234");
});

test("direct and bound compiled operations share codec dispatch, context and resolution", () => {
	let resolutions = 0;
	let context;
	const check = (receiver, spec, actualContext) => {
		assert.strictEqual(receiver, codec);
		assert.equal(spec.kind, "prepared-test");
		context ??= actualContext;
		assert.strictEqual(actualContext, context);
		assert.equal(actualContext.locale, "de-DE");
	};
	const codec = {
		kind: "prepared-test",
		resolve(spec, context) { check(this, spec, context); resolutions++; return {}; },
		format(value, spec, context) {
			check(this, spec, context);
			return [{ type: "integer", value: String(value) }];
		},
		formatString(value, spec, context) { check(this, spec, context); return String(value); },
		formatSeries(values, spec, context) {
			check(this, spec, context);
			return values.map(value => this.format(value, spec, context));
		},
		formatRange(start, end, spec, context) {
			check(this, spec, context);
			return [{ type: "literal", value: `${start}–${end}`, source: "shared" }];
		},
		formatDetailed(input, spec, context) { check(this, spec, context); return { parts: this.format(input, spec, context), roundedValue: input }; },
	};
	const formatter = new Formatter({ codecs: [codec], locale: "de-DE" });
	const spec = { kind: "prepared-test" };
	const calls = {
		format: [12], formatToParts: [12], formatDetailed: [12],
		formatSeries: [[1, 12]], formatSeriesToParts: [[1, 12]], formatColumn: [[1, 12]],
		formatRange: [1, 12], formatRangeToParts: [1, 12],
	};
	const expected = Object.fromEntries(Object.entries(calls).map(([name, args]) => [name, formatter[name](...args, spec)]));
	assert.equal(resolutions, Object.keys(calls).length);
	const compiled = formatter.compile(spec);
	assert.equal(resolutions, Object.keys(calls).length + 1);
	for (const [name, args] of Object.entries(calls)) {
		const bound = compiled[name];
		assert.deepEqual(bound(...args), expected[name]);
	}
	assert.equal(resolutions, Object.keys(calls).length + 1);
	assert.strictEqual(formatter.resolve(compiled.spec), compiled.resolution);
	assert.equal(formatter.formatSeries([1, 12], compiled.spec).length, 2);
	assert.equal(resolutions, Object.keys(calls).length + 1);
	assert.equal("codec" in compiled, false);
	assert.equal("context" in compiled, false);
});

test("direct preparation observes edited specifications while compilation owns a snapshot", () => {
	const formatter = createFormatter();
	const spec = { kind: "number", maximumFractionDigits: 1 };
	const compiled = formatter.compile(spec);
	assert.equal(formatter.format(1.234, spec), "1.2");
	spec.maximumFractionDigits = 2;
	assert.equal(formatter.format(1.234, spec), "1.23");
	assert.equal(compiled.format(1.234), "1.2");
	spec.kind = "bytes";
	assert.equal(formatter.format(1024, spec), "1 KiB");
	assert.equal(compiled.format(1024), "1,024");
});

test("prepared state is local to its formatter instance", () => {
	const german = createFormatter({ locale: "de-DE" });
	const english = createFormatter({ locale: "en-US" });
	const compiled = german.compile({ kind: "number" });
	assert.equal(compiled.format(1.5), "1,5");
	assert.equal(english.format(1.5, compiled.spec), "1,5");
	assert.equal(english.resolve(compiled.spec).locale, "de-DE");
	assert.equal(german.resolve(compiled.spec).locale, "de-DE");
	assert.equal(english.format(1.5, { ...compiled.spec, locale: "en-US" }), "1.5");
});

test("parser preparation reuses only same-instance compile-owned snapshots", () => {
	let resolutions = 0;
	const codec = {
		kind: "custom",
		format: value => [{ type: "literal", value }],
		formatRange: () => [],
		resolve(spec, context) {
			assert.strictEqual(this, codec);
			resolutions++;
			if (spec.disabled) throw new RangeError("disabled");
			return { locale: context.locale, rangeImplementation: "custom" };
		},
		parse(input, spec, context) { assert.strictEqual(this, codec); return context.locale + ":" + input; },
	};
	const first = new Parser({ codecs: [codec], locale: "en-US" });
	const compiled = first.compile({ kind: "custom" });
	const parse = compiled.parse;
	for (let index = 0; index < 100; index++) {
		assert.equal(first.parse("x", compiled.spec), "en-US:x");
		assert.equal(parse("x"), "en-US:x");
		assert.strictEqual(first.resolve(compiled.spec), compiled.resolution);
		assert.equal(first.supports(compiled.spec), true);
	}
	assert.equal(resolutions, 1);
	assert.equal(compiled.resolution.capabilities.format, false);
	assert.equal(compiled.resolution.capabilities.range, false);
	const second = new Parser({ codecs: [codec], locale: "de-DE" });
	assert.equal(second.parse("x", compiled.spec), "de-DE:x");
	assert.equal(resolutions, 2);
	let disabled = false;
	const mutable = Object.freeze({ kind: "custom", get disabled() { return disabled; } });
	first.parse("x", mutable);
	disabled = true;
	assert.throws(() => first.parse("x", mutable), /disabled/);
	assert.equal(first.supports(mutable), false);
	assert.equal(resolutions, 5);
	// A bound locale travels with the spec, unlike custom application context.
	const number = createFormatter({ locale: "de-DE" }).compile({ kind: "number" });
	assert.equal(createParser().parse("1,5", number.spec), "1.5");
});
