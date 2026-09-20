import test from "node:test";
import assert from "node:assert/strict";
import * as api from "@neutrium/formatter";
import { formatter, createFormatter, UnknownFormatError } from "@neutrium/formatter";
import { Formatter, numberCodec, bytesCodec, durationCodec } from "@neutrium/formatter/extensions";
import { Parser } from "@neutrium/formatter/extensions/parse";

test("exports a shared Formatter instance with the same API as configured instances", () => {
	const { formatter } = api;
	assert.ok(formatter instanceof Formatter);
	const configured = api.createFormatter();
	const spec = { kind: "number", maximumFractionDigits: 2 };
	const operations = {
		format: [1234.5, spec],
		formatToParts: [1234.5, spec],
		formatDetailed: [1234.5, spec],
		formatSeries: [[1.2, 12], spec],
		formatSeriesToParts: [[1.2, 12], spec],
		formatColumn: [[1.2, 12], spec],
		formatRange: [1, 2, spec],
		formatRangeToParts: [1, 2, spec],
	};
	for (const [method, args] of Object.entries(operations))
		assert.deepEqual(formatter[method](...args), configured[method](...args), method);
	assert.deepEqual(formatter.resolve(spec), configured.resolve(spec));
	assert.equal(formatter.supports(spec), configured.supports(spec));
	assert.equal("runtimeCapabilities" in formatter, false);
	assert.equal("has" in formatter, false);
	assert.equal("runtimeCapabilities" in api, false);
	const compiled = formatter.compile(spec);
	assert.equal(compiled.format(1.234), configured.compile(spec).format(1.234));
	assert.equal(compiled.parse, undefined);
	assert.ok(Object.isFrozen(compiled));
});

test("configured instances keep their locale and codec registry independent", () => {
	const local = api.createFormatter({ locale: "de-DE" });
	const spec = { kind: "number" };
	assert.notEqual(local, api.formatter);
	assert.equal(local.format(1234.5, spec), "1.234,5");
	assert.equal(api.formatter.format(1234.5, spec), "1,234.5");
	const extended = local.withCodec({ kind: "test-only", format: () => [{ type: "literal", value: "custom" }] });
	assert.equal(extended.supports({ kind: "test-only" }), true);
	assert.equal(extended.format(1, spec), "1");
	assert.equal(local.supports({ kind: "test-only" }), false);
	assert.equal(api.formatter.supports({ kind: "test-only" }), false);
});

test("extensions preserve defaults and reject duplicate kinds without changing the source", () => {
	const source = api.createFormatter({ locale: "de-DE", context: { prefix: "@" } });
	const extended = source.withCodec({
		kind: "label",
		format: (value, spec, context) => [{ type: "literal", value: context.data.prefix + value }],
	});
	assert.equal(extended.format("hello", { kind: "label" }), "@hello");
	assert.equal(extended.format(1.5, { kind: "number" }), "1,5");
	assert.equal(source.supports({ kind: "label" }), false);
	assert.throws(() => extended.withCodec({ kind: "label", format: () => [] }), api.DuplicateFormatError);
	assert.throws(() => new Formatter({ codecs: [numberCodec, numberCodec] }), api.DuplicateFormatError);
	assert.equal("format" in api, false);
	assert.equal("parse" in api, false);
});

test("constructor and extension snapshot the supplied codec array", () => {
	const codecs = [numberCodec];
	const source = new Formatter({ codecs });
	codecs.push(bytesCodec);
	const extended = source.withCodec(durationCodec);
	assert.equal(source.supports({ kind: "bytes" }), false);
	assert.equal(extended.supports({ kind: "bytes" }), false);
	assert.equal(extended.supports({ kind: "duration", presentation: "elapsed" }), true);
	assert.equal(source.supports({ kind: "duration", presentation: "elapsed" }), false);
	assert.equal(extended.format(1.5, { kind: "number" }), "1.5");
});

test("factory always includes built-ins and explicit registries install only supplied codecs", () => {
	const codec = { kind: "label", format: value => [{ type: "literal", value }] };
	const configured = createFormatter({ locale: "de-DE", codecs: [codec] });
	assert.equal(configured.format(1.5, { kind: "number" }), "1,5");
	assert.equal(configured.format("hello", { kind: "label" }), "hello");
	const isolated = new Formatter({ codecs: [codec] });
	assert.equal(isolated.supports({ kind: "number" }), false);
	assert.equal(isolated.format("hello", { kind: "label" }), "hello");
});

test("keeps the codec core extensible and independent of numeric formatting", () => {
	const coordinateCodec = {
		kind: "coordinate",
		format(value, options, context) {
			return [
				{ type: "literal", value: context.data.prefix || "" },
				{ type: "coordinate-x", value: String(value.x) },
				{ type: "literal", value: options.separator || "," },
				{ type: "coordinate-y", value: String(value.y) },
			];
		},
		parse(input, options, context) {
			const prefix = context.data.prefix || "";
			const [x, y] = input.slice(prefix.length).split(options.separator || ",");
			return { x: Number(x), y: Number(y) };
		},
	};
	const formatter = new Formatter({
		codecs: [coordinateCodec],
		context: { prefix: "@" },
	});
	const spec = { kind: "coordinate", separator: ":" };
	assert.equal(formatter.format({ x: 10, y: 20 }, spec), "@10:20");
	assert.deepEqual(new Parser({
		codecs: [coordinateCodec],
		context: { prefix: "@" },
	}).parse("@10:20", spec), { x: 10, y: 20 });
	assert.throws(() => formatter.format(1, { kind: "number" }), UnknownFormatError);
	const compiled = formatter.compile(spec);
	assert.equal(compiled.formatRange, undefined);
	assert.equal(compiled.formatRangeToParts, undefined);
	assert.equal(typeof compiled.parse, "undefined");
});
