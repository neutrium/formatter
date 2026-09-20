import test from "node:test";
import assert from "node:assert/strict";
import * as formatting from "@neutrium/formatter/extensions";
import * as parsing from "@neutrium/formatter/extensions/parse";
import { formatter } from "@neutrium/formatter";

test("all built-in formatting and parsing codecs are frozen", () => {
	for (const name of ["number", "currency", "unit", "percentage", "ordinal", "bytes", "duration"]) {
		for (const [codec, method] of [[formatting[name + "Codec"], "format"], [parsing[name + "Parser"], "parse"]]) {
			assert.ok(Object.isFrozen(codec), name);
			const original = codec[method];
			assert.throws(() => { codec[method] = () => "changed"; }, TypeError);
			assert.throws(() => { delete codec.resolve; }, TypeError);
			assert.strictEqual(codec[method], original);
		}
	}
	assert.equal(formatter.compile({ kind: "number" }).format(1234), "1,234");
});

test("separate parser codec objects can customize built-ins without changing their singleton", () => {
	const custom = { ...parsing.numberParser, parse: () => "custom" };
	const instance = new parsing.Parser({ codecs: [custom] });
	assert.equal(instance.compile({ kind: "number" }).parse("anything"), "custom");
	assert.equal(Object.isFrozen(custom), false);
	assert.notStrictEqual(custom.parse, parsing.numberParser.parse);
});
