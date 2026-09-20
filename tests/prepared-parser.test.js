import test from "node:test";
import assert from "node:assert/strict";
import { createParser } from "@neutrium/formatter/parse";
import { formatter } from "@neutrium/formatter";
import { Parser, numberParser, durationParser } from "@neutrium/formatter/extensions/parse";
import { nativeEngine } from "../dist/numeric/engines.js";
import { nativeGrammar } from "../dist/numeric/native/grammar.js";
import { createNumericParserPreparation } from "../dist/numeric/shared/parser.js";
import { countNumberParts, countCalls } from "./helpers/intl-probes.js";

test("parser validation and execution read caller options only once", () => {
	for (const [options, input, expected] of [
		[{ kind: "currency", locale: "de-DE", currency: "EUR", maximumFractionDigits: 1 }, "1,2 €", "1.2"],
		[{ kind: "number", zeroDisplay: "—" }, "—", "0"],
		[{ kind: "duration", presentation: "elapsed", inputUnit: "milliseconds", signDisplay: "always" }, "+0:01:01", "61000"],
	]) {
		const reads = {};
		const prototype = {};
		const spec = Object.assign(Object.create(prototype), { kind: options.kind });
		for (const [key, value] of Object.entries(options)) {
			if (key === "kind") continue;
			// Alternate inherited and own non-enumerable accessors.
			Object.defineProperty(Object.keys(reads).length % 2 ? spec : prototype, key, { get() {
				assert.equal(++reads[key], 1, `${options.kind}.${key} read again`);
				return value;
			} });
			reads[key] = 0;
		}
		assert.equal(createParser().parse(input, spec), expected);
		assert.ok(Object.values(reads).every(count => count === 1));
	}
});

test("bound numeric parsers retain scalar execution and discover grammar lazily", () => {
	let preparations = 0;
	const prepare = createNumericParserPreparation({ prepare(...args) {
		preparations++;
		return nativeEngine.prepare(...args);
	} }, nativeGrammar);
	const spec = { kind: "number", maximumFractionDigits: 2 };
	let plan;
	assert.equal(countNumberParts(() => {
		plan = prepare(spec, { locale: "en-US", data: {} });
		assert.equal(plan.resolve().locale, "en-US");
	}), 0);
	spec.maximumFractionDigits = 0;
	assert.equal(plan.parse("1,234.56"), "1234.56");
	assert.equal(plan.parse("2,345.67"), "2345.67");
	assert.equal(preparations, 1, "Probes and verification must reuse the bound scalar");
});

test("compiled parsers retain profiles even after the shared profile LRU evicts them", () => {
	const parser = createParser();
	const compiled = parser.compile({ kind: "number", maximumFractionDigits: 2 });
	compiled.parse("1,234.56");
	for (let index = 0; index < 130; index++)
		assert.equal(parser.parse(`nan${index}`, { kind: "number", nanDisplay: `nan${index}` }), "NaN");
	assert.equal(countNumberParts(() => {
		assert.equal(compiled.parse("2,345.67"), "2345.67");
	}), 1, "Eviction must not force a compiled parser to rediscover grammar");
});

test("copied built-in parsers use custom hooks and preserve their receiver", () => {
	for (const original of [numberParser, durationParser]) {
		assert.ok(Object.isFrozen(original));
		let resolutions = 0;
		const codec = { ...original,
			resolve() { assert.equal(this, codec); resolutions++; return {}; },
			parse(input) { assert.equal(this, codec); return `custom:${input}`; },
		};
		const parser = new Parser({ codecs: [codec] });
		const spec = { kind: codec.kind };
		assert.equal(parser.parse("a", spec), "custom:a");
		const compiled = parser.compile(spec);
		assert.equal(compiled.parse("b"), "custom:b");
		assert.equal(resolutions, 2);
		codec.parse = function (input) { assert.equal(this, codec); return `changed:${input}`; };
		assert.equal(compiled.parse("c"), "changed:c");
	}
});

test("bound parser preparation preserves option error identity", () => {
	for (const kind of ["number", "duration"]) {
		const failure = new SyntaxError("caller option failed");
		const spec = { kind, get locale() { throw failure; } };
		assert.throws(() => createParser().parse("1", spec), error => error === failure);
	}
});

test("equivalent reordered specifications share parser grammar across numeric domains", () => {
	for (const [spec, text, expected] of [
		[{ kind: "number", maximumFractionDigits: 2 }, "1,234.56", "1234.56"],
		[{ kind: "currency", currency: "USD", maximumFractionDigits: 2 }, "$12.34", "12.34"],
		[{ kind: "unit", unit: "meter", maximumFractionDigits: 2 }, "12.34 m", "12.34"],
		[{ kind: "percentage", maximumFractionDigits: 2 }, "12.34%", "0.1234"],
		[{ kind: "bytes", byteExponent: 1 }, "1.5 KiB", "1536"],
		[{ kind: "ordinal", useGrouping: false }, "23rd", "23"],
	]) {
		const parser = createParser();
		const first = parser.compile(spec);
		const reordered = parser.compile(Object.fromEntries(Object.entries(spec).reverse()));
		assert.equal(first.parse(text), expected);
		const warm = countNumberParts(() => assert.equal(first.parse(text), expected));
		assert.equal(countNumberParts(() => assert.equal(reordered.parse(text), expected)), warm, spec.kind);
		assert.equal(countNumberParts(() => assert.equal(parser.parse(text, reordered.spec), expected)), warm, spec.kind);
	}
});

test("profile keys canonicalize nested patterns and omit undefined fields and zero aliases", () => {
	const parser = createParser();
	const first = parser.compile({ kind: "ordinal", locale: "en-US",
		ordinalPatterns: { one: "{number}st", other: "{number}th" }, zeroDisplay: "zero" });
	const reordered = parser.compile({ zeroDisplay: "—", ordinalPatterns: { other: "{number}th", few: undefined, one: "{number}st" },
		maximumFractionDigits: undefined, locale: "en-US", kind: "ordinal" });
	assert.equal(first.parse("24th"), "24");
	const warm = countNumberParts(() => assert.equal(first.parse("24th"), "24"));
	assert.equal(countNumberParts(() => assert.equal(reordered.parse("24th"), "24")), warm);
	assert.equal(countNumberParts(() => {
		assert.equal(first.parse("zero"), "0");
		assert.equal(reordered.parse("—"), "0");
	}), 0);
	assert.throws(() => first.parse("—"), TypeError);
	assert.throws(() => reordered.parse("zero"), TypeError);
});

test("canonical profile keys include hidden compiled options and distinguish their values", () => {
	const parser = createParser();
	const ordinary = parser.compile({ kind: "number", maximumFractionDigits: 2 });
	assert.equal(ordinary.parse("1.25"), "1.25");
	const hidden = parser.compile(Object.defineProperty({ kind: "number", maximumFractionDigits: 2 },
		"decimalSeparator", { value: ":" }));
	assert.equal(hidden.parse("1:25"), "1.25");
	assert.throws(() => hidden.parse("1.25"), TypeError);
	const visible = parser.compile({ decimalSeparator: ":", maximumFractionDigits: 2, kind: "number" });
	const warm = countNumberParts(() => assert.equal(hidden.parse("1:25"), "1.25"));
	assert.equal(countNumberParts(() => assert.equal(visible.parse("1:25"), "1.25")), warm);
	assert.equal(ordinary.parse("1.25"), "1.25");
});

test("canonical profiles stay isolated by effective options and parser context", () => {
	const english = createParser({ locale: "en-US" });
	const german = createParser({ locale: "de-DE" });
	const spec = { kind: "number", maximumFractionDigits: 2 };
	assert.equal(english.compile(spec).parse("1,234.56"), "1234.56");
	assert.equal(german.compile(spec).parse("1.234,56"), "1234.56");
	assert.throws(() => english.compile({ maximumFractionDigits: 0, kind: "number" }).parse("1,234.56"), TypeError);
	assert.equal(english.compile({ maximumFractionDigits: 2, kind: "number" }).parse("1,234.56"), "1234.56");
});
test("compiled byte profiles preserve hidden options across every suffix scale", () => {
	for (const byteBase of [1000, 1024]) for (const byteExponent of [undefined, 1]) {
		const options = { byteBase, byteExponent, locale: "de-DE", maximumFractionDigits: 2, signDisplay: "always" };
		const spec = { kind: "bytes" };
		for (const [key, value] of Object.entries(options))
			Object.defineProperty(spec, key, { value, enumerable: false });
		const parser = createParser();
		const compiled = parser.compile(spec);
		const format = formatter.compile(spec);
		for (const [coefficient, suffix] of [[1.5, byteBase === 1000 ? "kB" : "KiB"], [2.5, byteBase === 1000 ? "kB" : "KiB"]]) {
			const value = coefficient * byteBase;
			const text = `+${String(coefficient).replace(".", ",")} ${suffix}`;
			assert.equal(format.format(value), text);
			assert.equal(compiled.parse(text), String(value));
			assert.equal(parser.parse(text, compiled.spec), String(value));
			assert.equal(parser.parse(text, spec), String(value));
		}
		if (byteExponent === undefined) {
			assert.equal(compiled.parse(byteBase === 1000 ? "+1,5 MB" : "+1,5 MiB"), String(1.5 * byteBase ** 2));
			assert.equal(compiled.parse("+500 B"), "500");
		}
	}
});

test("warm byte parsing retains scale plans without repeated Intl resolution", () => {
	for (const byteBase of [1000, 1024]) for (const byteExponent of [undefined, 1]) {
		const parser = createParser();
		const compiled = parser.compile({ kind: "bytes", byteBase, byteExponent });
		const units = byteBase === 1000 ? ["B", "kB", "MB"] : ["B", "KiB", "MiB"];
		const powers = byteExponent === undefined ? [0, 1, 2] : [1];
		for (const power of powers) compiled.parse(`3.5 ${units[power]}`);
		assert.equal(countCalls(Intl.NumberFormat.prototype, "resolvedOptions", () => {
			for (let repeat = 0; repeat < 10; repeat++) for (const power of powers) {
				// Use a value absent from the probe/exact-output cache.
				const text = `3.7 ${units[power]}`, expected = String(3.7 * byteBase ** power);
				assert.equal(compiled.parse(text), expected);
				assert.equal(parser.parse(text, compiled.spec), expected);
			}
		}), 0);
	}
});
