import test from "node:test";
import assert from "node:assert/strict";
import { formatter, createFormatter } from "@neutrium/formatter";
import { parser, createParser } from "@neutrium/formatter/parse";

const currency = {
	kind: "currency", currency: "USD", currencyDisplay: "name", notation: "compact",
	compactDisplay: "long", maximumFractionDigits: 1,
};

test("rounded currency names preserve the displayed value across plural changes", () => {
	const spec = { ...currency, locale: "ru" };
	const detail = formatter.formatDetailed(9999.9, spec);
	assert.equal(detail.text, "10 тысяч доллара США");
	assert.equal(detail.roundedValue, "10000");
	assert.notEqual(formatter.format(detail.roundedValue, spec), detail.text);
	assert.equal(parser.parse(detail.text, spec), "10000");
	assert.equal(parser.compile(spec).parse(detail.text), "10000");
});

test("currency-name witnesses cover compact plurals, signs, rounding directions and exact large values", () => {
	for (const locale of ["ru", "sl", "pl", "cs", "uk", "fr", "pt", "ar"]) {
		for (const roundingMode of ["halfExpand", "ceil", "floor"]) {
			const format = createFormatter({ locale }).compile({ ...currency, roundingMode });
			const parse = createParser({ locale }).compile(format.spec);
			for (const value of [999.99, -999.99, 9999.9, -9999.9, 12345.67, -12345.67, "999999999999999999999999"]) {
				const detail = format.formatDetailed(value);
				assert.equal(parse.parse(detail.text), detail.roundedValue, JSON.stringify({ locale, roundingMode, value, text: detail.text }));
				assert.equal(parse.parse(` \t${detail.text}\n`), detail.roundedValue);
			}
		}
	}
	for (const options of [{ negativeDisplay: "parentheses" }, { signDisplay: "never" }, { currencySymbol: "USD" }]) {
		const spec = { ...currency, locale: "ru", ...options };
		for (const value of [-9999.9, -12345.67]) {
			const detail = formatter.formatDetailed(value, spec);
			assert.equal(parser.parse(detail.text, spec), detail.roundedValue);
		}
	}
});

test("rounded currency grammar validation still rejects malformed and impossible presentations", () => {
	const spec = { ...currency, locale: "ru" };
	const parse = parser.compile(spec);
	for (const value of [9999.9, 12345.67, -12345.67]) {
		const text = formatter.format(value, spec);
		for (const invalid of ["00" + text, text + "junk", text.replace("доллара США", "евро"), text.replace("тысяч", "миллиард")])
			assert.throws(() => parse.parse(invalid), TypeError, invalid);
	}
	const standard = { kind: "currency", currency: "USD", currencyDisplay: "name", locale: "sl", maximumFractionDigits: 0 };
	assert.equal(parser.parse("3 ameriški dolarji", standard), "3");
	assert.throws(() => parser.parse("3 ameriška dolarja", standard), TypeError);
	assert.throws(() => parse.parse("10,123 тысяч доллара США"), TypeError);
});

test("currency name parsing covers localized plural categories", () => {
	for (const locale of ["sl", "ru", "pl", "cs"]) {
		for (const options of [{}, { notation: "compact" }, { compactExponent: 3 }]) {
			const spec = { kind: "currency", currency: "USD", currencyDisplay: "name", maximumFractionDigits: 0, locale, ...options };
			const compiled = formatter.compile(spec);
			for (const value of [1, 2, 3, 4, 5, 11, 101, -3, 3000, -3000]) {
				const text = compiled.format(value);
				const parsed = parser.compile(compiled.spec).parse(text);
				assert.equal(compiled.format(parsed), text);
				assert.equal(compiled.formatDetailed(value).roundedValue, parsed);
			}
			if (locale === "sl" && Object.keys(options).length === 0) {
				assert.equal(parser.compile(compiled.spec).parse("3 ameriški dolarji"), "3");
				assert.throws(() => parser.compile(compiled.spec).parse("3 ameriška dolarja"), TypeError);
			}
		}
	}
});
