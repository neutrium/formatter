import type { Decimal } from "@neutrium/decimal/arithmetic";
import type { FormatContext } from "../../core/codec.js";
import { decodeDigits, digitTokens } from "./digits.js";
import { createNumberFormat, intlFormat, localeFor } from "./intl-format.js";
import type { NumericFormatSpec } from "../specs.js";

/** Decode numeric parts before display overrides, without interpreting surrounding affixes. */
export function displayedCoefficient(parts: readonly Intl.NumberFormatPart[], spec: NumericFormatSpec, context: FormatContext): string | undefined
{
	let output = "";
	let digits: ReturnType<typeof digitTokens> | undefined;
	for (const part of parts)
	{
		switch (part.type)
		{
			case "integer":
			case "fraction":
			case "exponentInteger":
				output += /^[0-9]+$/.test(part.value) ? part.value : decodeDigits(part.value, digits ??= digitTokens(localeFor(spec, context), spec.numberingSystem));
				break;
			case "decimal":
				output += ".";
				break;
			case "exponentSeparator":
				output += "e";
				break;
			case "exponentMinusSign":
				output += "-";
				break;
		}
	}

	return output || undefined;
}

const COEFFICIENT_FORMATTERS = new WeakMap<Intl.NumberFormat, Intl.NumberFormat>();

/** Test the rendered coefficient, ignoring signs, grouping, and exponent magnitude. */
export function displaysZero(parts: readonly Intl.NumberFormatPart[], spec: NumericFormatSpec, context: FormatContext): boolean
{
	const coefficient = displayedCoefficient(parts, spec, context);
	return coefficient !== undefined && /^0+(?:\.0+)?(?:e[+-]?\d+)?$/.test(coefficient);
}

/** Unit patterns may omit a singular or dual numeral; recover its rounded coefficient. */
export function omittedUnitCoefficient(quantity: Decimal, spec: NumericFormatSpec, context: FormatContext): string
{
	const source = createNumberFormat(spec, context);
	let formatter = COEFFICIENT_FORMATTERS.get(source);

	if (!formatter)
	{
		formatter = new Intl.NumberFormat("en-US", {
			...source.resolvedOptions(),
			style: "decimal",
			notation: "standard",
			numberingSystem: "latn",
			useGrouping: false,
			signDisplay: "never"
		});
		COEFFICIENT_FORMATTERS.set(source, formatter);
	}

	return intlFormat(formatter, quantity.toValue());
}
