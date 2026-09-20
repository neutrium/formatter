import { normalizeNumericRange, positivePowerOfTen } from "../shared/decimal-string.js";
import type { NumericDomain } from "../shared/engine.js";
import { formatIntlParts, intlFormat, tokensFromIntlParts } from "../shared/intl-format.js";
import { renderedNumericQuantity } from "../shared/metadata.js";
import type { PercentageFormatSpec } from "./spec.js";

/** Bind the ratio-to-Intl scale once for scalar and native range rendering. */
export const percentageDomain: NumericDomain = {
	prepare(spec, context, formatter)
	{
		const scale = positivePowerOfTen((spec as PercentageFormatSpec).percentageScale ?? 100);
		return {
			intlQuantity: quantity => normalizeNumericRange(quantity.shift(scale - 2)),
			metadata: (quantity, raw, parts) => ({ quantity: renderedNumericQuantity(quantity, spec, context, raw, parts).shift(-scale) }),
			render: (value, capture) => tokensFromIntlParts(formatIntlParts(formatter, value, spec, capture)),
			string: value => intlFormat(formatter, value.toValue()),
		};
	},
};
