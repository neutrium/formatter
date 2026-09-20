import type { FormatToken } from "../core/tokens.js";
import type { Decimal } from "@neutrium/decimal/arithmetic";
import { parseQuantity, roundQuantityToInteger } from "../numeric/shared/decimal-string.js";
import type { NumericValue } from "../types.js";
import type { DurationFormatSpec, DurationValue } from "./spec.js";
import { durationSigns } from "./signs.js";

type CaptureElapsed = (rounded: Decimal, negative: boolean) => void;

export function formatElapsedDuration(value: DurationValue, spec: DurationFormatSpec, capture?: CaptureElapsed): readonly FormatToken[]
{
	if (typeof value === "object" && value !== null && !("toValue" in value))
	{
		throw new TypeError("Duration records require an explicitly localized duration specification");
	}

	return formatElapsedQuantity(parseQuantity(value as NumericValue), spec, capture);
}

/** Trusted internal quantity path, shared with elapsed parser verification. */
export function formatElapsedQuantity(quantity: Decimal, spec: DurationFormatSpec, capture?: CaptureElapsed): readonly FormatToken[]
{
	if (spec.inputUnit === "milliseconds")
	{
		quantity = quantity.shift(-3);
	}

	const finite = quantity.isFinite();
	const rounded = finite ? roundQuantityToInteger(quantity, spec.roundingMode) : quantity;
	const signs = durationSigns(rounded.isNeg(), rounded.isZero(), spec);
	capture?.(rounded, signs.negative);

	if (!finite)
	{
		return [
			...signs.prefix,
			{
				type: "literal",
				value: quantity.isNaN() ? "NaN" : "Infinity"
			},
			...signs.suffix
		];
	}

	const seconds = BigInt(rounded.abs().toFixed());
	const hours = seconds / 3600n;
	const remainder = Number(seconds % 3600n);
	const minutes = Math.floor(remainder / 60);
	const secondPart = remainder % 60;

	return [
		...signs.prefix,
		{ type: "hours", value: String(hours) },
		{ type: "literal", value: ":" },
		{ type: "minutes", value: String(minutes).padStart(2, "0") },
		{ type: "literal", value: ":" },
		{ type: "seconds", value: String(secondPart).padStart(2, "0") },
		...signs.suffix,
	];
}

/** Serialize the rounded quantity only for detailed output, using the rendered sign policy. */
export function formatElapsedDurationDetailed(value: DurationValue, spec: DurationFormatSpec)
{
	let rounded!: Decimal;
	const parts = formatElapsedDuration(value, spec, (quantity, negative) => {
		rounded = negative ? quantity : quantity.abs();
	});

	if (spec.inputUnit === "milliseconds")
	{
		rounded = rounded.shift(3);
	}

	return {
		/** Semantic fragments of the elapsed duration text. */
		parts,
		/** Rounded elapsed value in the specification's input unit. */
		roundedValue: rounded.toFixed(),
	};
}
