import test from "node:test";
import assert from "node:assert/strict";
import { createFormatter, DuplicateFormatError } from "@neutrium/formatter";
import { createParser } from "@neutrium/formatter/parse";
import { Formatter } from "@neutrium/formatter/extensions";
import { Parser } from "@neutrium/formatter/extensions/parse";

for (const [operation, Registry, factory, optional] of [
	["format", Formatter, createFormatter, ["formatString", "formatSeries", "selectSeriesSpec", "formatRange", "formatDetailed", "resolve"]],
	["parse", Parser, createParser, ["resolve"]],
]) {
	test(`${operation} registries reject invalid codecs at every registration entry point`, () => {
		const source = new Registry();
		const valid = { kind: "custom", [operation]: () => operation === "format" ? [] : "ok" };
		const invalid = [null, undefined, false, 1, "custom", {},
			...[undefined, null, 1, "", "  "].map(kind => ({ ...valid, kind })),
			...[undefined, null, false, true, 1, "method", {}].map(value => ({ ...valid, [operation]: value })),
			...optional.flatMap(method => [null, false, true, 1, "method", {}].map(value => ({ ...valid, [method]: value }))),
		];
		for (const codec of invalid) {
			for (const register of [
				() => new Registry({ codecs: [codec] }),
				() => factory({ codecs: [codec] }),
				() => source.withCodec(codec),
			]) assert.throws(register, TypeError);
		}
		assert.equal(source.supports({ kind: "custom" }), false);
		const custom = source.withCodec(valid);
		assert.equal(custom.supports({ kind: "custom" }), true);
		assert.throws(() => custom.withCodec(valid), DuplicateFormatError);
	});

	test(`${operation} resolution rejects a required method made non-callable after registration`, () => {
		const codec = { kind: "custom", [operation]: () => operation === "format" ? [] : "ok" };
		const custom = new Registry({ codecs: [codec] });
		const spec = { kind: "custom" };
		for (const method of [undefined, null, true, {}]) {
			codec[operation] = method;
			const resolved = custom.resolve(spec);
			assert.equal(resolved.supported, false);
			assert.equal(resolved.error.name, "TypeError");
			assert.equal(custom.supports(spec), false);
			assert.throws(() => custom.compile(spec), TypeError);
			assert.throws(() => custom[operation]("1", spec), TypeError);
		}
	});
}

test("codec validation permits class methods, omitted hooks, and shared format/parse codecs", () => {
	class SharedCodec {
		kind = "custom";
		resolve = undefined;
		format(value) { return [{ type: "literal", value }]; }
		parse(value) { return value; }
	}
	const codec = new SharedCodec();
	const format = new Formatter({ codecs: [codec] });
	const parse = new Parser({ codecs: [codec] });
	assert.equal(format.format("ok", { kind: "custom" }), "ok");
	assert.equal(parse.parse("ok", { kind: "custom" }), "ok");
});

test("capability claims require callable implementations, not merely truthy properties", () => {
	const codec = { kind: "custom", format: () => [], parse: true, resolve: () => ({ parse: true }) };
	const format = new Formatter({ codecs: [codec] });
	const spec = { kind: "custom" };
	assert.equal(format.supports(spec), false);
	assert.throws(() => format.compile(spec), /without a parse implementation/);
	codec.resolve = () => ({ rangeImplementation: "custom" });
	codec.formatRange = true;
	assert.equal(format.supports(spec), false);
	assert.throws(() => format.compile(spec), /without a range implementation/);
});
