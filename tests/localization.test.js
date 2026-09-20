import { parser, createParser } from "@neutrium/formatter/parse";
import test from "node:test";
import assert from "node:assert/strict";
import { formatter as builtInFormatter, createFormatter, UnsupportedOrdinalLocaleError } from "@neutrium/formatter";
import { supportedOrdinalLocales, supportsOrdinal } from "@neutrium/formatter/diagnostics";

test("delegates locale grouping and decimal syntax to Intl", () => {
	const german = createFormatter({ locale: "de-DE" });
	const indian = createFormatter({ locale: "hi-IN" });
	assert.equal(german.format(1234567.89, { kind: "number", maximumFractionDigits: 2 }), "1.234.567,89");
	assert.equal(indian.format(1234567.89, { kind: "number", maximumFractionDigits: 2 }), "12,34,567.89");
	assert.equal(createParser({ locale: "de-DE" }).parse("1.234.567,89", { kind: "number", maximumFractionDigits: 2 }), "1234567.89");
});

test("round-trips localized digits and bidi literals", () => {
	const formatter = createFormatter({ locale: "ar-EG" });
	const spec = { kind: "number", maximumFractionDigits: 2 };
	const output = formatter.format(-1234567.89, spec);
	assert.match(output, /١/);
	assert.equal(createParser({ locale: "ar-EG" }).parse(output, spec), "-1234567.89");
});

test("uses Intl currency placement, spacing, names, and accounting signs", () => {
	const french = createFormatter({ locale: "fr-FR" });
	const us = createFormatter({ locale: "en-US" });
	assert.equal(french.format(1234.5, { kind: "currency", currency: "EUR" }), "1 234,50 €");
	assert.equal(us.format(-1234.5, {
		kind: "currency",
		currency: "USD",
		currencySign: "accounting",
	}), "($1,234.50)");
	assert.equal(us.format(2, {
		kind: "currency",
		currency: "USD",
		currencyDisplay: "name",
	}), "2.00 US dollars");
});

test("uses Intl compact data and pluralized long forms", () => {
	const formatter = createFormatter({ locale: "en-US" });
	assert.equal(formatter.format(1200000, { kind: "number", notation: "compact" }), "1.2M");
	assert.equal(formatter.format(1200000, {
		kind: "number",
		notation: "compact",
		compactDisplay: "long",
	}), "1.2 million");
	assert.equal(parser.parse("1.2 million", {
		kind: "number",
		notation: "compact",
		compactDisplay: "long",
	}), "1200000");
	const french = createFormatter({ locale: "fr-FR" });
	const frenchSpec = { kind: "number", notation: "compact", compactDisplay: "long" };
	assert.equal(createParser({ locale: "fr-FR" }).parse(french.format(1000, frenchSpec), frenchSpec), "1000");
	assert.equal(createParser({ locale: "fr-FR" }).parse(french.format(1536, frenchSpec), frenchSpec), "1500");
});

test("parses localized scientific exponent syntax", () => {
	for (const locale of ["ar-EG", "sv-SE"])
	{
		const formatter = createFormatter({ locale });
		const spec = { kind: "number", notation: "scientific", maximumFractionDigits: 3 };
		const rendered = formatter.format("0.00125", spec);
		assert.equal(createParser({ locale }).parse(rendered, spec), "0.00125");
	}
});

test("supports locale and symbol overrides without a locale registry", () => {
	const formatter = createFormatter({ locale: "en-US" });
	const number = { kind: "number", groupSeparator: "_", decimalSeparator: "," };
	assert.equal(formatter.format(1234.5, number), "1_234,5");
	assert.equal(parser.parse("1_234,5", number), "1234.5");
	assert.equal(formatter.format(12, {
		kind: "currency",
		currency: "USD",
		currencySymbol: "US$",
	}), "US$12.00");
	assert.equal(formatter.format(0.25, {
		kind: "percentage",
		percentageSymbol: " pct",
	}), "25 pct");
});

test("supports built-in and caller-supplied ordinal patterns", () => {
	assert.equal(createFormatter({ locale: "en-US" }).format(1023, { kind: "ordinal" }), "1,023rd");
	assert.equal(createFormatter({ locale: "fr-FR" }).format(1, { kind: "ordinal" }), "1er");
	assert.equal(createFormatter({ locale: "ja-JP" }).format(23, { kind: "ordinal" }), "第23");
	const custom = { kind: "ordinal", ordinalPatterns: { other: "No. {number}" } };
	assert.equal(createFormatter().format(42, custom), "No. 42");
});

test("exposes expanded ordinal coverage and fails closed", () => {
	assert.ok(supportedOrdinalLocales.includes("hu"));
	assert.ok(supportsOrdinal("hu-HU"));
	assert.ok(supportsOrdinal("id-ID"));
	assert.equal(builtInFormatter.format(2, { kind: "ordinal", locale: "hu-HU" }), "2.");
	assert.equal(builtInFormatter.format(2, { kind: "ordinal", locale: "id-ID" }), "ke-2");
	assert.equal(builtInFormatter.format(2, { kind: "ordinal", locale: "th-TH-u-nu-thai" }), "ที่ ๒");
	assert.equal(supportsOrdinal("ar-EG"), false);
	assert.throws(
		() => builtInFormatter.format(2, { kind: "ordinal", locale: "ar-EG" }),
		UnsupportedOrdinalLocaleError,
	);
	assert.equal(builtInFormatter.format(2, {
		kind: "ordinal",
		locale: "ar-EG",
		ordinalFallback: "number",
	}), "٢");
	assert.equal(builtInFormatter.format(2, {
		kind: "ordinal",
		locale: "ar-EG",
		ordinalPatterns: { other: "الـ{number}" },
	}), "الـ٢");
});
