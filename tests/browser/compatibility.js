import { parser, createParser } from "@neutrium/formatter/parse";
import { runtimeCapabilities } from "@neutrium/formatter/diagnostics";
import { formatter, renderTokens } from "@neutrium/formatter";
import { numericExtremes, compactUnitLocales } from "../fixtures/intl-cases.js";
import { countNumberParts } from "../helpers/intl-probes.js";

export const cases = [
	{
		name: "Decimal numeric input syntax",
		run(equal) {
			for (const [input, expected] of [["0xff", "255"], ["0b1010", "10"], ["0o17", "15"],
				["1_000", "1,000"], ["-0x0", "-0"], ["0x20_0000_0000_0001", "9,007,199,254,740,993"],
				["1e100001", "∞"], ["-1e-100001", "-0"]]) {
				equal(formatter.format(input, { kind: "number" }), expected);
				equal(formatter.compile({ kind: "number" }).format({ toValue: () => input }), expected);
			}
			equal(formatter.format("0x1.8p-5", { kind: "number", maximumFractionDigits: 6 }), "0.046875");
			equal(formatter.format("0x3c", { kind: "duration", presentation: "elapsed" }), "0:01:00");
		},
	},
	{
		name: "large fractional compact plurals",
		run(equal) {
			for (const [locale, suffix] of [["ru", "тысячи"], ["lv", "tūkstotis"]]) {
				const spec = { kind: "number", locale, compactExponent: 3, compactDisplay: "long",
					useGrouping: false, maximumFractionDigits: 1 };
				for (const sign of ["", "-"]) {
					const input = `${sign}9007199254741005100`;
					const detail = formatter.formatDetailed(input, spec);
					equal(detail.text, `${sign}9007199254741005,1 ${suffix}`);
					equal(parser.parse(detail.text, spec), input);
				}
			}
		},
	},
	{
		name: "fixed compact padded zero grammar",
		run(equal) {
			for (const locale of ["lv", "ru", "pl"]) {
				const options = { notation: "compact", compactDisplay: "long", minimumFractionDigits: 2,
					maximumFractionDigits: 2, roundingIncrement: 5000, roundingMode: "trunc" };
				const native = new Intl.NumberFormat(locale, options);
				const spec = { kind: "number", locale, ...options, compactExponent: 3 };
				for (const input of [1000, -1000]) {
					const detail = formatter.formatDetailed(input, spec);
					equal(detail.text, native.format(input));
					equal(parser.parse(detail.text, spec), input < 0 ? "-0" : "0");
				}
			}
		},
	},
	{ name: "exact decimal runtime capability", run(equal) { equal(runtimeCapabilities().exactDecimalStrings, true); } },
	{
		name: "rounded overflow and underflow",
		run(equal) {
			for (const [input, domain, roundingMode, normalized] of [
				["1.79e308", { kind: "number", notation: "scientific" }, "halfExpand", Infinity],
				["-1.79e308", { kind: "number", compactExponent: 3 }, "halfExpand", -Infinity],
				["1.79e308", { kind: "bytes", byteBase: 1000 }, "halfExpand", Infinity],
				["2.6e-324", { kind: "number", notation: "scientific" }, "trunc", 0],
				["-2.6e-324", { kind: "number", notation: "engineering" }, "trunc", -0],
				["2.6e-322", { kind: "percentage", percentageScale: 1 }, "trunc", 0],
			]) {
				for (const overrides of [{}, { zeroDisplay: "—", infinityDisplay: "unbounded" }]) {
					const spec = { ...domain, roundingMode, maximumSignificantDigits: 1, ...overrides };
					const detail = formatter.formatDetailed(input, spec);
					equal(detail.text, formatter.format(normalized, spec));
					equal(detail.roundedValue, formatter.formatDetailed(normalized, spec).roundedValue);
					equal(parser.parse(detail.text, spec), detail.roundedValue);
					equal(formatter.format(detail.roundedValue, spec), detail.text);
					equal(formatter.formatRange(input, 10, spec), formatter.formatRange(normalized, 10, spec));
				}
			}
		},
	},
	{
		name: "input overflow and underflow",
		run(equal) {
			for (const domain of [{ kind: "ordinal" }, { kind: "bytes" }, { kind: "number", compactExponent: 3 },
				{ kind: "number", notation: "scientific" }, { kind: "currency", currency: "USD" }]) {
				for (const overrides of [{}, { zeroDisplay: "—", infinityDisplay: "unbounded" }]) {
					const spec = { ...domain, ...overrides };
					for (const [input, normalized] of numericExtremes) {
						const detail = formatter.formatDetailed(input, spec);
						equal(detail.text, formatter.format(normalized, spec));
						equal(detail.roundedValue, formatter.formatDetailed(normalized, spec).roundedValue);
						equal(parser.parse(detail.text, spec), detail.roundedValue);
						equal(formatter.formatRange(input, 1, spec), formatter.formatRange(normalized, 1, spec));
					}
				}
			}
			for (const value of ["1e309", "-1e309"]) {
				const detail = formatter.formatDetailed(value, { kind: "number" });
				equal(detail.roundedValue, value.startsWith("-") ? "-Infinity" : "Infinity");
				equal(parser.parse(detail.text, { kind: "number" }), detail.roundedValue);
			}
		},
	},
	{
		name: "special display sign interpretation",
		run(equal) {
			equal(formatter.formatDetailed(-Infinity, { kind: "number", signDisplay: "never", infinityDisplay: "(unbounded)" }).roundedValue, "Infinity");
			equal(formatter.formatDetailed(-0, { kind: "number", signDisplay: "never", zeroDisplay: "(none)" }).roundedValue, "0");
			equal(formatter.formatDetailed(-Infinity, { kind: "currency", currency: "USD", currencySign: "accounting", infinityDisplay: "(unbounded)" }).roundedValue, "-Infinity");
		},
	},
	{
		name: "columns and compiled scale reuse",
		run(equal) {
			equal(JSON.stringify(formatter.formatColumn([1, 20], { kind: "number" }, { align: "right" })), '[" 1","20"]');
			equal(JSON.stringify(formatter.formatColumn([1, 20], { kind: "number" }, { align: "left" })), '["1 ","20"]');
			const thousands = formatter.compileSeries([900, 1200], { kind: "number", notation: "compact", maximumFractionDigits: 1 });
			equal(thousands.spec.compactExponent, 3);
			equal(parser.compile(thousands.spec).parse("0.9K"), "900");
			equal(thousands.format(2_000_000), "2,000K");
			const kibibytes = formatter.compileSeries([1024, 2048], { kind: "bytes" });
			equal(kibibytes.spec.byteExponent, 1);
			equal(kibibytes.format(1048576), "1,024 KiB");
		},
	},
	{
		name: "invalid specifications reject empty series",
		run(equal) {
			for (const spec of [
				{ kind: "number", maximumFractonDigits: 2 },
				{ kind: "number", negativeDisplay: "invalid" },
				{ kind: "bytes", base: 999 }, { kind: "bytes", byteBase: 999 },
				{ kind: "percentage", percentageScale: 3 },
				{ kind: "ordinal", ordinalPatterns: { one: "{number}st" } },
			]) {
				equal(formatter.supports(spec), false);
				let rejected = false;
				try { formatter.formatSeries([], spec); } catch { rejected = true; }
				equal(rejected, true);
			}
		},
	},
	{
		name: "exact decimals, tokens and metadata across locales",
		run(equal) {
			for (const locale of ["en-US", "de-DE", "ar-EG"]) {
				const spec = { kind: "number", locale, maximumFractionDigits: 2 };
				const value = "9007199254740993.25";
				const compiled = formatter.compile(spec);
				equal(parser.compile(compiled.spec).parse(compiled.format(value)), value);
				equal(renderTokens(compiled.formatToParts(value)), compiled.format(value));
				equal(compiled.formatDetailed(value).roundedValue, value);
				for (const options of [
					{ kind: "bytes" },
					{ kind: "number", maximumFractionDigits: 2 },
					{ kind: "number", notation: "compact" },
				]) {
					const series = formatter.compile({ ...options, locale });
					const values = [1200, 1536, 2048];
					equal(JSON.stringify(series.formatSeries(values)), JSON.stringify(series.formatSeriesToParts(values).map(renderTokens)));
					const detail = series.formatDetailed(-1536);
					equal(detail.roundedValue, parser.compile(series.spec).parse(detail.text));
				}
			}
		},
	},
	{
		name: "signed rounding and byte boundary parsing",
		run(equal) {
			equal(formatter.format(-1.2, { kind: "number", negativeDisplay: "parentheses", roundingMode: "floor", maximumFractionDigits: 0 }), "(2)");
			equal(formatter.format(-0.1, { kind: "number", negativeDisplay: "parentheses", signDisplay: "exceptZero", maximumFractionDigits: 0 }), "0");
			equal(formatter.formatDetailed(1048575, { kind: "bytes" }).roundedValue, "1048576");
			equal(parser.parse("3 ameriški dolarji", { kind: "currency", currency: "USD", currencyDisplay: "name", locale: "sl", maximumFractionDigits: 0 }), "3");
			equal(parser.parse("1.2M", { kind: "number", notation: "compact" }), "1200000");
		},
	},
	{
		name: "display aliases and incremental whitespace parsing",
		run(equal) {
			const overlapping = createParser().compile({ kind: "number", notation: "compact", zeroDisplay: " 1K " });
			equal(overlapping.parse("1K"), "0");
			equal(overlapping.parse("2K"), "2000");
			equal(overlapping.parse("1K"), "0");
			equal(overlapping.parse(" 1K "), "0");
			const whitespaceParser = createParser().compile({ kind: "number", notation: "compact" });
			const whitespaceCalls = countNumberParts(() => equal(whitespaceParser.parse(" \t1.2K\n"), "1200"));
			if (whitespaceCalls > 100) throw new Error(`Whitespace parsing ran ${whitespaceCalls} Intl calls`);
		},
	},
	{
		name: "rounded compact unit grammar",
		run(equal) {
			for (const locale of compactUnitLocales) {
				const spec = { kind: "unit", unit: "meter", unitDisplay: "long", locale,
					notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 };
				for (const value of [1999.9, -1999.9]) {
					const detail = formatter.formatDetailed(value, spec);
					equal(parser.parse(detail.text, spec), detail.roundedValue);
				}
			}
		},
	},
	{
		name: "zero-only and negative compact plural categories",
		run(equal) {
			const zeroCompact = { kind: "number", locale: "lv", notation: "compact", compactDisplay: "long",
				maximumFractionDigits: 0, roundingIncrement: 25, roundingMode: "ceil" };
			const zeroDetail = formatter.formatDetailed(-1000, zeroCompact);
			equal(zeroDetail.roundedValue, "-0");
			equal(zeroDetail.scale.exponent, 3);
			equal(parser.parse(zeroDetail.text, zeroCompact), "-0");
			equal(parser.parse("25", zeroCompact), "25");
			const negativeCompact = { kind: "number", locale: "sl", notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 };
			equal(parser.parse(formatter.format(-2000000, negativeCompact), negativeCompact), "-2000000");
			equal(parser.parse(formatter.format(-23500000, negativeCompact), negativeCompact), "-23500000");
		},
	},
	{
		name: "rounded currency names and compact metadata",
		run(equal) {
			const currencyName = { kind: "currency", currency: "USD", currencyDisplay: "name", locale: "ru",
				notation: "compact", compactDisplay: "long", maximumFractionDigits: 1 };
			for (const value of [9999.9, 12345.67, -12345.67]) {
				const detail = formatter.formatDetailed(value, currencyName);
				equal(parser.parse(detail.text, currencyName), detail.roundedValue);
			}
			for (const locale of ["ru", "pl", "fr", "ar"]) {
				const spec = { kind: "number", locale, notation: "compact", compactDisplay: "long" };
				const detail = formatter.formatDetailed(9999, spec);
				equal(detail.text, formatter.format(9999, spec));
				equal(detail.roundedValue, parser.parse(detail.text, spec));
			}
		},
	},
	{
		name: "automatic and fixed compact rounding increments",
		run(equal) {
			const compactIncrement = { kind: "number", notation: "compact", maximumFractionDigits: 0, roundingIncrement: 100, roundingMode: "ceil" };
			const compactDetail = formatter.formatDetailed(1000, compactIncrement);
			equal(compactDetail.roundedValue, "100000");
			equal(compactDetail.scale.exponent, 3);
			equal(parser.parse(compactDetail.text, compactIncrement), "100000");
			const fixedIncrement = { ...compactIncrement, compactExponent: 3, roundingIncrement: 5000 };
			const fixedDetail = formatter.formatDetailed(1000, fixedIncrement);
			equal(fixedDetail.text, "5,000K");
			equal(fixedDetail.roundedValue, "5000000");
			equal(parser.parse(fixedDetail.text, fixedIncrement), "5000000");
			equal(formatter.supports({ ...fixedIncrement, compactExponent: 4 }), false);
			for (const locale of ["ru", "pl", "fr", "lv"]) {
				for (const roundingMode of ["trunc", "ceil"]) {
					const options = { notation: "compact", compactDisplay: "long", maximumFractionDigits: 0,
						roundingIncrement: 5, roundingMode };
					const native = new Intl.NumberFormat(locale, options);
					const fixed = formatter.compile({ kind: "number", locale, ...options, compactExponent: 3 });
					for (const value of [1000, 5000, -1000, -5000, 25000]) {
						const detail = fixed.formatDetailed(value);
						equal(detail.text, native.format(value));
						equal(fixed.format(value), detail.text);
						equal(parser.parse(detail.text, fixed.spec), detail.roundedValue);
					}
				}
			}
		},
	},
	{
		name: "numeral-free Arabic unit grammar and shared scales",
		run(equal) {
			const arabicUnit = { kind: "unit", unit: "meter", locale: "ar", maximumFractionDigits: 0 };
			const dual = formatter.formatDetailed(2.1, arabicUnit);
			equal(dual.roundedValue, "2");
			equal(parser.parse(dual.text, arabicUnit), "2");
			const sharedUnits = formatter.compileSeries([1000, 2000], { ...arabicUnit, notation: "compact" });
			equal(sharedUnits.spec.compactExponent, 3);
			equal(sharedUnits.format(2000), formatter.format(2000, { ...arabicUnit, notation: "compact" }));
			equal(parser.parse(sharedUnits.format(2000), sharedUnits.spec), "2000");
			const compactUnit = { ...arabicUnit, notation: "compact" };
			const roundedUnit = formatter.formatDetailed(999999, compactUnit);
			equal(parser.parse(roundedUnit.text, compactUnit), roundedUnit.roundedValue);
		},
	},
	{
		name: "whole-output zero placeholders and range sources",
		run(equal) {
			const roundedZero = { kind: "number", maximumFractionDigits: 2, zeroDisplay: "—" };
			equal(parser.parse(formatter.format("0.001", roundedZero), roundedZero), "0");
			equal(parser.parse(formatter.format("-0.001", roundedZero), roundedZero), "0");
			for (const domain of [{ kind: "currency", currency: "USD", currencySign: "accounting" },
				{ kind: "number", compactExponent: 3 }, { kind: "bytes", byteExponent: 1 }]) {
				const spec = { ...domain, maximumFractionDigits: 2, zeroDisplay: "—" };
				const detail = formatter.formatDetailed(-0.001, spec);
				equal(detail.text, "—");
				equal(detail.roundedValue, "0");
				equal(detail.scale, undefined);
				equal(JSON.stringify(detail.parts), '[{"type":"literal","value":"—"}]');
				const rangeParts = formatter.formatRangeToParts(-0.001, 2, spec);
				equal(renderTokens(rangeParts.filter(part => part.source === "startRange")), "—");
			}
		},
	},
	{
		name: "resolution failures and parser snapshot reuse",
		run(equal) {
			const unreadable = { get kind() { throw new TypeError("unreadable kind"); } };
			equal(formatter.resolve(unreadable).supported, false);
			equal(parser.supports(unreadable), false);
			const compiledParser = parser.compile({ kind: "number" });
			equal(parser.resolve(compiledParser.spec), compiledParser.resolution);
		},
	},
	{
		name: "exact range endpoints above the safe integer limit",
		run(equal) {
			const range = formatter.formatRangeToParts("9007199254740993", "9007199254740994", { kind: "number", useGrouping: false });
			for (const [source, value] of [["startRange", "9007199254740993"], ["endRange", "9007199254740994"]]) {
				equal(range.filter(part => part.source === source && part.type === "integer").map(part => part.value).join(""), value);
			}
		},
	},
	{
		name: "native durations, sign caches and unavailable services",
		run(equal) {
			const durationSpec = { kind: "duration", presentation: "localized", style: "digital", fractionalDigits: 3 };
			equal(formatter.format("3661.125", durationSpec), "1:01:01.125");
			const signedDuration = formatter.compile({ ...durationSpec, locale: "ar-EG", signDisplay: "always" });
			const signedText = signedDuration.format(-61);
			const signedParts = signedDuration.formatToParts(-61);
			signedParts[0].value = "changed";
			const signProbeCalls = countNumberParts(() => {
				for (const text of signedDuration.formatSeries(Array(100).fill(-61))) equal(text, signedText);
				equal(signedDuration.formatDetailed(-61).text, signedText);
			});
			equal(signProbeCalls, 0);
			const descriptor = Object.getOwnPropertyDescriptor(Intl, "DurationFormat");
			try {
				Object.defineProperty(Intl, "DurationFormat", { value: undefined, configurable: true });
				equal(formatter.supports(durationSpec), false);
				equal(formatter.resolve(durationSpec).error.name, "RangeError");
				for (const run of [
					() => formatter.format("3661.125", durationSpec),
					() => formatter.compile(durationSpec),
					() => formatter.formatSeries([], durationSpec),
				]) {
					let failure;
					try { run(); } catch (error) { failure = error; }
					equal(failure instanceof RangeError, true);
					equal(failure.message.includes("Intl.DurationFormat"), true);
				}
				const elapsed = { kind: "duration", presentation: "elapsed" };
				equal(formatter.format(3661, elapsed), "1:01:01");
				equal(parser.parse("1:01:01", elapsed), "3661");
			} finally {
				if (descriptor) Object.defineProperty(Intl, "DurationFormat", descriptor);
				else delete Intl.DurationFormat;
			}
		},
	},
];
