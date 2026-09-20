import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { cardinalSelector } from "../dist/numeric/native/cardinals.js";
import { generateCardinalData } from "../tools/cardinal-data.mjs";
import { formatter, renderTokens } from "@neutrium/formatter";
import { parser } from "@neutrium/formatter/parse";

test("generated cardinal rules match the installed CLDR source", () => {
	assert.equal(readFileSync(new URL("../src/numeric/native/cardinal-data.ts", import.meta.url), "utf8"), generateCardinalData());
});

test("exact cardinal evaluation matches CLDR integer and visible-decimal examples", () => {
	const require = createRequire(import.meta.url);
	const locales = require("cldr-core/supplemental/plurals.json").supplemental["plurals-type-cardinal"];
	let checked = 0;
	for (const [locale, categories] of Object.entries(locales)) {
		const select = cardinalSelector(locale);
		for (const [name, rule] of Object.entries(categories)) {
			const category = name.replace("pluralRule-count-", "");
			for (const sample of rule.split(/@integer|@decimal/).slice(1).flatMap(part => part.trim().split(/[,~]\s*/))) {
				if (!/^\d+(?:\.\d+)?$/.test(sample)) continue;
				assert.equal(select(sample), category, `${locale}: ${sample}`);
				checked++;
			}
		}
	}
	assert.ok(checked > 3000, checked);
});

test("cardinal operands preserve arbitrarily large fractions, leading zeros and visible trailing zeros", () => {
	const ru = cardinalSelector("ru");
	assert.equal(ru("9007199254741001"), "one");
	assert.equal(ru("9007199254741001.0"), "other");
	assert.equal(ru(`9007199254741001.${"0".repeat(99)}1`), "other");
	assert.equal(cardinalSelector("hr")(`1000000.${"0".repeat(99)}1`), "one");
	assert.equal(cardinalSelector("hr")(`1000000.${"0".repeat(98)}11`), "other");
	assert.equal(cardinalSelector("lv")("1000000.01"), "one");
	assert.equal(cardinalSelector("lv")("1000000.010"), "other");
	assert.equal(cardinalSelector("ar")("0003.000"), "few");
	assert.equal(cardinalSelector("ar")("0003.0001"), "other");
	assert.equal(cardinalSelector("pt-BR")("0"), "one");
	assert.equal(cardinalSelector("pt-PT")("0"), "other");
	assert.equal(cardinalSelector("pt-AO")("0"), "other");
});

test("large fractional compact values use exact grammar across rendering and parsing", () => {
	for (const [locale, suffix] of [["ru", "тысячи"], ["lv", "tūkstotis"], ["hr", "tisuća"]]) {
		for (const digits of [10, 16, 50, 100]) {
			const spec = { kind: "number", locale, compactExponent: 3, compactDisplay: "long",
				minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false };
			const compiled = formatter.compile(spec);
			const parsing = parser.compile(compiled.spec);
			for (const integer of ["1000000", "9007199254741005"]) for (const sign of ["", "-"]) {
				const value = `${sign}${integer}000.${"0".repeat(digits - 4)}1`;
				const detail = compiled.formatDetailed(value);
				assert.equal(detail.parts.find(part => part.type === "unit").value, suffix, `${locale}: ${value}`);
				assert.equal(detail.roundedValue, value);
				assert.equal(renderTokens(compiled.formatToParts(value)), detail.text);
				assert.equal(compiled.formatSeries([value])[0], detail.text);
				assert.equal(parsing.parse(detail.text), value);
			}
		}
	}
});

test("plural grammar follows rendered significant precision and stripped trailing zeros", () => {
	const spec = { kind: "number", locale: "ru", compactExponent: 3, compactDisplay: "long", useGrouping: false };
	const value = "9007199254741001000.00001";
	assert.equal(formatter.format(value, { ...spec, maximumSignificantDigits: 21 }), "9007199254741001 тысяча");
	assert.equal(formatter.format(value, { ...spec, minimumSignificantDigits: 21, maximumSignificantDigits: 21 }),
		"9007199254741001,00000 тысячи");
	assert.equal(formatter.format("9007199254741001000", { ...spec, minimumFractionDigits: 16,
		maximumFractionDigits: 16, trailingZeroDisplay: "stripIfInteger" }), "9007199254741001 тысяча");
});
