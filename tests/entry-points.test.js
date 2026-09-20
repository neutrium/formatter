import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { formatter, createFormatter } from "@neutrium/formatter";
import { numberCodec } from "@neutrium/formatter/extensions";
import { parser, createParser, UnsupportedParseError } from "@neutrium/formatter/parse";
import { Parser, numberParser } from "@neutrium/formatter/extensions/parse";

test("ordinary entry points omit codec-authoring exports", async () => {
	const formatting = await import("@neutrium/formatter");
	const parsing = await import("@neutrium/formatter/parse");
	const extensions = await import("@neutrium/formatter/extensions");
	assert.equal("Formatter" in formatting, false);
	assert.equal("supportsOrdinal" in formatting, false);
	assert.deepEqual(Object.keys(formatting).filter(name => name.endsWith("Codec")), []);
	assert.deepEqual(Object.keys(parsing).sort(), ["DuplicateFormatError", "UnknownFormatError", "UnsupportedParseError", "createParser", "parser"]);
	assert.equal("Parser" in extensions, false);
	assert.equal("formatter" in extensions, false);
});

test("formatting and parsing have independent authoritative APIs", () => {
	const spec = { kind: "number" };
	assert.equal("parse" in formatter, false);
	assert.equal("parse" in formatter.compile(spec), false);
	assert.equal("parse" in numberCodec, false);
	assert.equal("format" in parser, false);
	assert.equal("format" in numberParser, false);
	assert.equal(formatter.resolve(spec).capabilities.parse, false);
	assert.deepEqual(parser.resolve(spec).capabilities, {
		format: false, formatToParts: false, parse: true, series: false, columns: false,
		range: false, rangeImplementation: "unsupported",
	});
	assert.equal(parser.supports({ kind: "duration", presentation: "localized" }), false);
	assert.throws(() => parser.compile({ kind: "duration", presentation: "localized" }), UnsupportedParseError);
	assert.equal(parser.parse("1,234.5", spec), "1234.5");
});

test("compiled parsers reuse immutable specs, locale, context and original resolution errors", () => {
	let resolutions = 0;
	const codec = {
		kind: "custom",
		resolve(spec, context) { assert.equal(this, codec); resolutions++; return { locale: context.locale }; },
		parse(input, spec, context) {
			assert.equal(this, codec);
			return context.data.prefix + spec.nested.label + input;
		},
	};
	const codecs = [codec];
	const custom = new Parser({ codecs, locale: "de-DE", context: { prefix: "@" } });
	codecs.length = 0;
	const spec = { kind: "custom", nested: { label: "before" } };
	const compiled = custom.compile(spec);
	spec.nested.label = "after";
	const parse = compiled.parse;
	assert.equal(parse("1"), "@before1");
	assert.equal(compiled.parse("2"), "@before2");
	assert.equal(resolutions, 1);
	assert.equal(compiled.resolution.locale, "de-DE");
	assert.ok(Object.isFrozen(compiled.spec.nested));
	assert.ok(Object.isFrozen(compiled));
	const extended = custom.withCodec(numberParser);
	assert.equal(extended.parse("1,5", { kind: "number" }), "1.5");
	assert.equal(custom.supports({ kind: "number" }), false);
	assert.throws(() => extended.withCodec(numberParser), /already registered/);
	const failure = new TypeError("original failure");
	codec.resolve = () => { throw failure; };
	assert.throws(() => custom.compile(spec), error => error === failure);
	assert.throws(() => custom.parse("1", spec), error => error === failure);
	assert.equal(custom.resolve(spec).error.name, "TypeError");
});

test("separately configured parsers reuse automatically selected formatting scales", () => {
	for (const locale of ["en-US", "fr-FR", "ar-EG"]) {
		const format = createFormatter({ locale }).compileSeries([900, 1200], {
			kind: "number", notation: "compact", maximumFractionDigits: 1,
		});
		const parse = createParser({ locale }).compile(format.spec);
		assert.equal(parse.parse(format.format(900)), "900");
		assert.equal(parse.parse(format.format(1200)), "1200");
	}
});

test("exposes an ESM-only package entry point", () => {
	const require = createRequire(import.meta.url);
	assert.throws(
		() => require("@neutrium/formatter"),
		(error) => error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
	);
});
