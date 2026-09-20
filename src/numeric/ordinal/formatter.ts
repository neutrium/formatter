import type { Decimal } from "@neutrium/decimal/arithmetic";
import type { FormatContext } from "../../core/codec.js";
import type { FormatToken } from "../../core/tokens.js";
import { prepareOrdinalPattern } from "./patterns.js";
import type { CaptureParts, NumericDomain } from "../shared/engine.js";
import { formatIntlParts, tokensFromIntlParts } from "../shared/intl-format.js";
import { displayedCoefficient } from "../shared/coefficient.js";
import type { OrdinalFormatSpec } from "./spec.js";

function formatOrdinal(
	quantity: Decimal,
	spec: OrdinalFormatSpec,
	context: FormatContext,
	capture: CaptureParts | undefined,
	formatter: Intl.NumberFormat,
	select: (integer: string) => string
): readonly FormatToken[]
{
	let raw: readonly Intl.NumberFormatPart[] = [];
	const parts = formatIntlParts(formatter, quantity, spec, captured => {
		raw = captured;
		capture?.(captured);
	});

	if (!quantity.isFinite())
	{
		return tokensFromIntlParts(parts);
	}

	// Raw parts retain the rounded numeral before separators or placeholders are overridden.
	const integer = displayedCoefficient(raw, spec, context)!.split(".")[0];
	const pattern = select(integer);
	const [prefix, suffix] = pattern.split("{number}");

	return [
		...(prefix ? [{ type: "ordinal", value: prefix } as FormatToken] : []),
		...tokensFromIntlParts(parts),
		...(suffix ? [{ type: "ordinal", value: suffix } as FormatToken] : []),
	];
}
export const ordinalDomain: NumericDomain = {
	prepare(spec, context, formatter)
	{
		const ordinal = spec as OrdinalFormatSpec;
		const select = prepareOrdinalPattern(spec.locale || context.locale, ordinal.ordinalPatterns, ordinal.ordinalFallback);

		return {
			render: (source, capture) => formatOrdinal(source, ordinal, context, capture, formatter, select)
		};
	},
};
