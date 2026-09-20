import test from "node:test";
import assert from "node:assert/strict";
import { createFormatter, formatter } from "@neutrium/formatter";
import { Formatter } from "@neutrium/formatter/extensions";
import { createParser, parser } from "@neutrium/formatter/parse";
import { Parser } from "@neutrium/formatter/extensions/parse";

test("compiled specifications retain locale across differently configured instances", () => {
	const german = createFormatter({ locale: "de-DE" });
	for (const spec of [{ kind: "number" }, { kind: "number", locale: undefined }]) {
		const compiled = german.compile(spec);
		assert.equal(compiled.spec.locale, "de-DE");
		assert.equal(compiled.resolution.locale, "de-DE");
		assert.equal(compiled.format("1.234"), "1,234");
		assert.equal(parser.parse("1,234", compiled.spec), "1.234");
		assert.equal(parser.compile(compiled.spec).parse("1,234"), "1.234");
		assert.equal(formatter.compile(compiled.spec).format("1.234"), "1,234");
		assert.equal(spec.locale, undefined);
		assert.ok(Object.isFrozen(compiled.spec));
	}
	const compiledParser = createParser({ locale: "de-DE" }).compile({ kind: "number" });
	assert.equal(compiledParser.spec.locale, "de-DE");
	assert.equal(formatter.format("1.234", compiledParser.spec), "1,234");
	for (const instance of [german, createParser({ locale: "de-DE" })]) {
		assert.equal(instance.compile({ kind: "number", locale: "fr-FR" }).spec.locale, "fr-FR");
	}
});

test("compiled series bind both selected scale and locale", () => {
	const compiled = createFormatter({ locale: "de-DE" }).compileSeries([1000, 2000], { kind: "bytes" });
	assert.equal(compiled.spec.locale, "de-DE");
	assert.equal(compiled.spec.byteExponent, 1);
	const text = compiled.format(1536);
	assert.equal(parser.compile(compiled.spec).parse(text), "1536");
	assert.equal(formatter.compile(compiled.spec).format(1536), text);
});

test("locale injection preserves graph snapshots and rejects accessors without reading them", () => {
	const codec = { kind: "custom", format: (_, spec) => [{ type: "literal", value: spec.locale }], parse: (_, spec) => spec.locale };
	for (const instance of [new Formatter({ locale: "de-DE", codecs: [codec] }), new Parser({ locale: "de-DE", codecs: [codec] })]) {
		const spec = Object.assign(Object.create(null), { kind: "custom", nested: { locale: undefined } });
		spec.self = spec;
		const compiled = instance.compile(spec);
		assert.equal(compiled.spec.locale, "de-DE");
		assert.equal(compiled.spec.self, compiled.spec);
		assert.equal(Object.getPrototypeOf(compiled.spec), null);
		assert.equal(compiled.spec.nested.locale, undefined);
		assert.equal(Object.hasOwn(spec, "locale"), false);
		let reads = 0;
		assert.throws(() => instance.compile({ kind: "custom", get locale() { reads++; return "fr"; } }), /accessor/);
		assert.equal(reads, 0);
	}
});

test("series hooks inherit the bound locale when returned options omit it", () => {
	const codec = { kind: "custom", format: (_, spec) => [{ type: "literal", value: spec.locale }],
		selectSeriesSpec(_, spec) { assert.equal(spec.locale, "fr-FR"); return { kind: "custom" }; } };
	const compiled = new Formatter({ locale: "de-DE", codecs: [codec] }).compileSeries([], { kind: "custom", locale: "fr-FR" });
	assert.equal(compiled.spec.locale, "fr-FR");
	assert.equal(compiled.format(1), "fr-FR");
});
