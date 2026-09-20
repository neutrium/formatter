import type { FormatContext } from "../../core/codec.js";
import { displayedCoefficient } from "../shared/coefficient.js";
import { decimalOrder, parseQuantity } from "../shared/decimal-string.js";
import { createNumberFormat, intlFormatToParts } from "../shared/intl-format.js";
import { numericSpecOptions } from "../shared/options.js";
import type { NumericFormatSpec } from "../specs.js";
const COMPACT_SCALES = new WeakMap<Intl.NumberFormat, { scales: Map<string, number>; next: number; zeroes: boolean; }>();
const COMPACT_COEFFICIENTS = ["1", "1.1", "1.5", "2", "3", "4", "5", "6", "10", "11", "12", "20", "21", "22", "25", "100", "101", "102", "1001", "1000000"];
const compactText = (parts: readonly Intl.NumberFormatPart[]) => parts.filter(part => part.type === "compact").map(part => part.value).join("");

/** Caller-independent probes: exact coefficients, or truncation to a compact zero. */
export function neutralCompactFormatter(spec: NumericFormatSpec, context: FormatContext, zero = false): Intl.NumberFormat
{
	return createNumberFormat({
		...numericSpecOptions(spec),
		notation: "compact", compactExponent: undefined, minimumIntegerDigits: 1, useGrouping: false, signDisplay: "never",
		minimumFractionDigits: zero ? 0 : undefined, maximumFractionDigits: zero ? 0 : undefined,
		minimumSignificantDigits: zero ? undefined : 1, maximumSignificantDigits: zero ? undefined : 21,
		roundingIncrement: zero ? 5 : 1, roundingMode: "trunc", roundingPriority: "auto", trailingZeroDisplay: "auto",
	} as NumericFormatSpec, context);
}

/** Locale compact labels carry scales independently of the caller's rounding increment. */
export function displayedCompactExponent(parts: readonly Intl.NumberFormatPart[], spec: NumericFormatSpec, context: FormatContext): number
{
	const label = compactText(parts);

	if (!label)
	{
		return 0;
	}

	const formatter = neutralCompactFormatter(spec, context);
	let profile = COMPACT_SCALES.get(formatter);

	if (!profile)
	{
		profile = { scales: new Map(), next: 0, zeroes: false };
		COMPACT_SCALES.set(formatter, profile);
	}

	while (!profile.scales.has(label) && profile.next < 30 * COMPACT_COEFFICIENTS.length)
	{
		const index = profile.next;
		const input = `${COMPACT_COEFFICIENTS[index % COMPACT_COEFFICIENTS.length]}E${1 + Math.floor(index / COMPACT_COEFFICIENTS.length)}`;
		const probe = intlFormatToParts(formatter, input);
		const compact = compactText(probe);

		if (compact)
		{
			profile.scales.set(compact, decimalOrder(parseQuantity(input)) -
				decimalOrder(parseQuantity(displayedCoefficient(probe, spec, context) ?? "1")));
		}

		profile.next++;
	}

	if (!profile.scales.has(label) && !profile.zeroes)
	{
		// Exact nonzero probes cannot expose zero-only plural forms. Start at each
		// proven magnitude and truncate its coefficient of one to zero: unlike the
		// caller's rounding, this cannot promote the probe into a larger magnitude.
		const zeroFormatter = neutralCompactFormatter(spec, context, true);

		for (const exponent of new Set(profile.scales.values()))
		{
			const probe = intlFormatToParts(zeroFormatter, `1E${exponent}`);
			const compact = compactText(probe);

			if (compact && parseQuantity(displayedCoefficient(probe, spec, context) ?? "1").isZero())
			{
				profile.scales.set(compact, exponent);
			}
		}

		profile.zeroes = true;
	}

	const exponent = profile.scales.get(label);

	if (exponent === undefined)
	{
		throw new RangeError("Unable to resolve the rendered compact magnitude");
	}

	return exponent;
}
