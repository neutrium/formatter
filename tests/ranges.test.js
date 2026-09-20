import test from "node:test";
import assert from "node:assert/strict";
import { formatter as builtInFormatter, renderTokens } from "@neutrium/formatter";

test("formats native Intl ranges with endpoint source metadata", () => {
	const spec = { kind: "currency", currency: "USD" };
	assert.equal(builtInFormatter.formatRange(1, 2, spec), "$1.00 – $2.00");
	const parts = builtInFormatter.formatRangeToParts(1, 2, spec);
	assert.equal(renderTokens(parts), "$1.00 – $2.00");
	assert.deepEqual([...new Set(parts.map((part) => part.source))], [
		"startRange", "shared", "endRange",
	]);
	assert.equal(
		builtInFormatter.formatRange("9007199254740993", "9007199254740995", { kind: "number" }),
		"9,007,199,254,740,993–9,007,199,254,740,995",
	);
	assert.equal(builtInFormatter.formatRange(1, 1, { kind: "number" }), "~1");
});

test("formats wrapper-domain ranges with the locale range separator", () => {
	assert.equal(builtInFormatter.formatRange(1024, 2048, { kind: "bytes" }), "1 KiB–2 KiB");
	assert.equal(builtInFormatter.formatRange(1, 3, { kind: "ordinal" }), "1st–3rd");
	assert.equal(builtInFormatter.formatRange(-2, 3, {
		kind: "number",
		negativeDisplay: "parentheses",
	}), "(2)–3");
});
