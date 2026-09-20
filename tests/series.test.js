import { parser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter as builtInFormatter, renderTokens, formatter } from "@neutrium/formatter";
import { Formatter } from "@neutrium/formatter/extensions";
import { textWidth } from "../dist/core/text-width.js";

test("uses one compact magnitude across a numeric series", () => {
	const spec = {
		kind: "number",
		notation: "compact",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	};
	assert.deepEqual(builtInFormatter.formatSeries([1_200_000, 1_500_000, 980_000], spec), [
		"1.20M", "1.50M", "0.98M",
	]);
	assert.deepEqual(builtInFormatter.formatSeries([1_200, 1_200_000], spec, { scale: "individual" }), [
		"1.20K", "1.20M",
	]);
	assert.deepEqual(builtInFormatter.formatSeries([1_200, 1_200_000], spec), ["0.00M", "1.20M"]);
});

test("uses one byte unit across a byte series", () => {
	const spec = { kind: "bytes", maximumFractionDigits: 2 };
	assert.deepEqual(builtInFormatter.formatSeries([1024, 1536, 2048], spec), ["1 KiB", "1.5 KiB", "2 KiB"]);
	assert.deepEqual(builtInFormatter.formatSeries([1024, 1048576], spec, { scale: "individual" }), ["1 KiB", "1 MiB"]);
	assert.deepEqual(builtInFormatter.formatSeries([1024, 1536], { ...spec, byteExponent: 0 }), ["1,024 B", "1,536 B"]);
	assert.equal(parser.parse("1.5 KiB", { ...spec, byteExponent: 1 }), "1536");
});

test("retains semantic parts for series output", () => {
	const rows = builtInFormatter.formatSeriesToParts(
		[1200, 1500],
		{ kind: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 },
	);
	assert.deepEqual(rows.map(renderTokens), ["$1.2K", "$1.5K"]);
	assert.ok(rows.every((row) => row.some((part) => part.type === "currency")));
});

test("aligns columns by decimal position, left edge, or right edge", () => {
	assert.deepEqual(builtInFormatter.formatColumn(
		[1.2, 12, 123.45],
		{ kind: "number", maximumFractionDigits: 2 },
	), ["  1.2 ", " 12   ", "123.45"]);
	assert.deepEqual(builtInFormatter.formatColumn([1, 100], { kind: "number" }, { align: "right", fill: "." }), [
		"..1", "100",
	]);
	assert.deepEqual(builtInFormatter.formatColumn([1, 100], { kind: "number" }, { align: "left", fill: "." }), [
		"1..", "100",
	]);
	assert.deepEqual(builtInFormatter.formatColumn([], { kind: "number" }), []);
	assert.deepEqual(builtInFormatter.formatColumn(
		[1.2, 12],
		{
			kind: "currency",
			currency: "USD",
			currencySymbol: ".",
			minimumFractionDigits: 0,
			maximumFractionDigits: 1,
		},
	), [" .1.2", ".12  "]);
	assert.throws(
		() => builtInFormatter.formatColumn([1], { kind: "number" }, { fill: "ab" }),
		/exactly one Unicode code point/,
	);
	assert.throws(
		() => builtInFormatter.formatSeries([1], { kind: "number" }, { scale: "global" }),
		/Unsupported series scale/,
	);
});

test("compiled formatters expose series and column operations", () => {
	const formatter = builtInFormatter.compile({
		kind: "number",
		notation: "compact",
		maximumFractionDigits: 1,
	});
	assert.deepEqual(formatter.formatSeries([1200, 900000]), ["1.2K", "900K"]);
	assert.deepEqual(formatter.formatColumn([1200, 900000], { align: "right" }), ["1.2K", "900K"]);
	assert.deepEqual(
		formatter.formatSeriesToParts([1200]).map(renderTokens),
		["1.2K"],
	);
});

test("columns above the runtime argument limit work in every alignment mode", () => {
	const size = 150_000;
	const values = Array(size).fill("1");
	values[size - 1] = "123";
	const simple = new Formatter({ codecs: [{ kind: "text", format: (value) => [{ type: "integer", value }] }] });
	for (const align of ["left", "right", "decimal"])
	{
		const output = simple.formatColumn(values, { kind: "text" }, { align });
		assert.equal(output.length, size);
		assert.equal(output[0], align === "left" ? "1  " : "  1");
		assert.equal(output[size - 1], "123");
	}
});

test("invalid column fills and alignments are rejected before rendering even empty columns", () => {
	let renders = 0;
	const instance = new Formatter({ codecs: [{ kind: "label", format: value => { renders++; return [{ type: "literal", value }]; } }] });
	const spec = { kind: "label" };
	const compiled = instance.compile(spec);
	for (const values of [[], ["x", "yy"]]) for (const options of [
		...[null, [" "], { length: 1, 0: " " }, new String(" "), 1, false, "", "xx"].map(fill => ({ fill })),
		{ align: null }, { align: false },
	]) {
		assert.throws(() => instance.formatColumn(values, spec, options), RangeError);
		assert.throws(() => compiled.formatColumn(values, options), RangeError);
	}
	assert.equal(renders, 0);
	assert.deepEqual(compiled.formatColumn(["x", "yy"], { align: "right", fill: "😀" }), ["😀x", "yy"]);
	assert.deepEqual(compiled.formatColumn(["x", "yy"], { align: undefined, fill: undefined }), [" x", "yy"]);
});

test("column widths preserve Unicode code-point semantics", () => {
	const values = ["", "ascii", "😀", "a😀b", "\ud800", "\udc00", "\ud800a\udc00", "e\u0301", "👨‍👩‍👧", "\ud800😀\udc00"];
	for (const value of values) assert.equal(textWidth(value), Array.from(value).length);
	const custom = new Formatter({ codecs: [{ kind: "text", format: value => [{ type: "literal", value }], formatString: value => value }] });
	for (const align of ["left", "right"]) {
		const target = Math.max(...values.map(value => Array.from(value).length));
		const expected = values.map(value => {
			const padding = "🟦".repeat(target - Array.from(value).length);
			return align === "left" ? value + padding : padding + value;
		});
		assert.deepEqual(custom.formatColumn(values, { kind: "text" }, { align, fill: "🟦" }), expected);
	}
	const spec = { kind: "number", decimalSeparator: "🟦", groupSeparator: "😀", maximumFractionDigits: 2 };
	const expected = ["   1🟦2 ", "1234🟦56"];
	assert.deepEqual(formatter.formatColumn([1.2, 1234.56], { ...spec, useGrouping: false }), expected);
	assert.deepEqual(formatter.compile(spec).formatColumn([1.2, 1234.56]), ["    1🟦2 ", "1😀234🟦56"]);
});
