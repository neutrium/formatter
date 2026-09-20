import { renderTokens } from "../../core/tokens.js";
import { addQuantities, parseQuantity } from "../shared/decimal-string.js";
import { COMPACT_PATTERN_SAMPLES } from "./compact-samples.js";
import type { NumericParseGrammar, ParseProbe } from "../shared/parse-grammar.js";
import type { NumericFormatSpec } from "../specs.js";

type NativeSpec = Extract<NumericFormatSpec, { kind: "number" | "currency" | "unit" }>;
// Exercise CLDR cardinal categories, including modulo and million-specific rules.
const PLURAL_VALUES = [
	"0", "0.1", "0.5", "1", "1.1", "1.2", "1.5", "2", "3", "4", "5", "6",
	"10", "11", "12", "20", "21", "22", "23", "25", "100", "101", "102", "1000", "1001", "1000000",
];
const COMPACT_PLURAL_COEFFICIENTS = /* @__PURE__ */ COMPACT_PATTERN_SAMPLES.flatMap(value => [value, `-${value}`]);

function hasPluralAffixes(spec: NumericFormatSpec): boolean
{
	return spec.kind === "unit" || spec.kind === "currency" && spec.currencyDisplay === "name";
}

export const nativeGrammar: NumericParseGrammar = {
	*probes(spec, probe)
	{
		const options = spec as NativeSpec;
		const pluralAffixes = hasPluralAffixes(options);

		if (options.compactExponent !== undefined)
		{
			// Use the renderer's width-sensitive operands alongside zero and rare plurals.
			const coefficients = [...new Set([...PLURAL_VALUES, ...COMPACT_PATTERN_SAMPLES])].flatMap(value => [value, `-${value}`]);

			for (const coefficient of coefficients)
			{
				yield probe(`${coefficient}E${options.compactExponent}`, options, options.compactExponent);
			}

			return;
		}

		if (options.notation === "compact")
		{
			const unscaled = pluralAffixes ? PLURAL_VALUES : ["1", "2"];

			for (const value of unscaled)
			{
				yield probe(value, options, "infer");
				yield probe(`-${value}`, options, "infer");
			}

			const fractionalAffixes = new Set<string>();
			const affixKey = (value: ParseProbe) => JSON.stringify([value.scale, value.input.isNeg(),
				...value.tokens.filter(token => token.type === "unit").map(token => token.value)]);

			for (let exponent = 1; exponent <= 30; exponent++)
			{
				// Compact suffixes themselves are pluralized, for both signs.
				for (const coefficient of COMPACT_PLURAL_COEFFICIENTS)
				{
					const sample = probe(`${coefficient}E${exponent}`, options, "infer");
					yield sample;

					if (pluralAffixes && !fractionalAffixes.has(affixKey(sample)))
					{
						// Compact and unit/currency plurals can use different operands.
						const fraction = parseQuantity(coefficient.startsWith("-") ? "-0.1" : "0.1");
						const fractional = probe(addQuantities(sample.input, fraction), options, "infer");
						yield fractional;
						fractionalAffixes.add(affixKey(fractional));
					}
				}

				if (pluralAffixes)
				{
					// A rounded boundary can retain the original value's unit/currency grammar.
					const boundary = parseQuantity(`1E${exponent}`);

					for (const offset of ["-1", "1", "2", "5", "25", "-0.1", "0.1"])
					{
						const value = addQuantities(boundary, parseQuantity(offset));
						yield probe(value, options, "infer");
						yield probe(value.neg(), options, "infer");
					}
				}
			}
			return;
		}

		if (pluralAffixes)
		{
			for (const value of PLURAL_VALUES)
			{
				yield probe(value, options);
				yield probe(`-${value}`, options);
			}

			return;
		}

		for (const value of ["0.00125", "1", "2", "12345.678", "-0.00125", "-1", "-2", "-12345.678"])
		{
			yield probe(value, options);
		}
	},
	canTrim(spec)
	{
		const options = spec as NativeSpec;

		return options.compactExponent === undefined &&
			!(options.kind === "currency" && options.currencySymbol !== undefined) &&
			!(options.kind === "unit" && options.unitSymbol !== undefined);
	},
	offset: (value, spec) => hasPluralAffixes(spec) ? addQuantities(value.input, value.rounded.neg()) : undefined,
	/** Unit and currency-name grammars can select an affix before rounding. */
	matchesRounded(source, rounded, offsets, trim, probe)
	{
		for (const offset of offsets)
		{
			if (offset.isZero()) continue;

			const witness = probe(addQuantities(rounded, offset));
			const text = renderTokens(witness.tokens);
			// Prove that a real input produces both this text and the same rounded value.
			if (
				(trim ? text.trim() : text) === source &&
				witness.rounded.eq(rounded) &&
				(!rounded.isZero() || witness.rounded.isNeg() === rounded.isNeg())
			) {
				return true;
			}
		}

		return false;
	},
};
