import type { Decimal } from "@neutrium/decimal/arithmetic";
import type { FormatContext } from "../../core/codec.js";
import type { FormatToken } from "../../core/tokens.js";
import { displayedCoefficient, omittedUnitCoefficient } from "./coefficient.js";
import { parseQuantity } from "./decimal-string.js";
import type { NumericFormatSpec } from "../specs.js";

/** Recover the domain value from trusted rendered parts, shared by saturation and detailed output. */
export function renderedNumericQuantity(
	quantity: Decimal,
	spec: NumericFormatSpec,
	context: FormatContext,
	raw: readonly Intl.NumberFormatPart[],
	parts: readonly FormatToken[]
): Decimal
{
	const special = raw.find(part => part.type === "nan" || part.type === "infinity");
	const coefficient = special ? special.type === "nan" ? "NaN" : "Infinity" : displayedCoefficient(raw, spec, context) ??
		(spec.kind === "unit" && !raw.some(part => part.type === "compact")
			? omittedUnitCoefficient(quantity.shift(-(spec.compactExponent ?? 0)), spec, context) : "1");
	// Caller display literals cannot introduce signs; accounting signs come from raw Intl parts.
	const negative = quantity.isNeg() && (parts.some(part => part.type === "sign") ||
		raw.some(part => part.type === "literal" && part.value.includes("(")));
	const rounded = parseQuantity((negative ? "-" : "") + coefficient);

	return rounded;
}
