import { parser, createParser } from "@neutrium/formatter/parse";
import assert from "node:assert/strict";
import { formatter, createFormatter, renderTokens } from "@neutrium/formatter";
import { runtimeCapabilities } from "@neutrium/formatter/diagnostics";

const { Formatter, numberCodec } = await import("@neutrium/formatter/extensions");
const { Parser, numberParser } = await import("@neutrium/formatter/extensions/parse");
assert.equal(new Formatter({ codecs: [numberCodec] }).format(12, { kind: "number" }), "12");
assert.equal(new Parser({ codecs: [numberParser] }).parse("12", { kind: "number" }), "12");
await assert.rejects(import("@neutrium/formatter/dist/core/CompiledFormatter.js"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });

assert.equal(runtimeCapabilities().exactDecimalStrings, true);
assert.ok(Object.isFrozen(runtimeCapabilities()));
assert.strictEqual(runtimeCapabilities(), runtimeCapabilities());
assert.equal("runtimeCapabilities" in formatter, false);
assert.equal("has" in formatter, false);

assert.equal(formatter.format("9007199254740993.25", { kind: "number", useGrouping: false }), "9007199254740993.25");
const thousands = formatter.compileSeries([900, 1200], { kind: "number", notation: "compact", maximumFractionDigits: 1 });
assert.equal(thousands.spec.compactExponent, 3);
assert.equal(parser.compile(thousands.spec).parse("0.9K"), "900");
assert.equal(thousands.format(2_000_000), "2,000K");
const money = formatter.compile({ kind: "currency", currency: "USD" });
const details = money.formatDetailed("12.25");
assert.equal(details.text, "$12.25");
assert.strictEqual(details.resolution, money.resolution);
assert.equal("value" in details, false);
assert.equal("resolved" in details, false);
assert.equal(parser.compile(money.spec).parse(money.format("12.25")), "12.25");
assert.equal(renderTokens(money.formatToParts("12.25")), "$12.25");
assert.equal(parser.parse("1,024 KiB", { kind: "bytes" }), "1048576");
assert.equal(formatter.format(3661, { kind: "duration", presentation: "elapsed" }), "1:01:01");
assert.equal(createParser({ locale: "de-DE" }).parse("1,5", { kind: "number" }), "1.5");
console.log("Packed consumer runtime passed");
