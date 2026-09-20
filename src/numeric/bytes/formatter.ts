import type { Decimal } from "@neutrium/decimal/arithmetic";
import { immutableSnapshot } from "../../core/immutable-snapshot.js";
import { dividePowerOfTwo, multiplyPowerOfTwo, normalizeNumericRange } from "../shared/decimal-string.js";
import { BYTE_UNITS_1000, BYTE_UNITS_1024 } from "./units.js";
import type { NumericDomain } from "../shared/engine.js";
import { formatIntlParts, intlFormat, tokensFromIntlParts } from "../shared/intl-format.js";
import { renderedNumericQuantity } from "../shared/metadata.js";
import { numericSpecOptions } from "../shared/options.js";
import type { BytesFormatSpec } from "./spec.js";

function selectByteUnit(value: Decimal, base: 1000 | 1024, count: number): number
{
	const magnitude = value.abs();
	let unit = 0;

	while (unit + 1 < count && magnitude.gte(BigInt(base) ** BigInt(unit + 1)))
	{
		unit += 1;
	}

	return unit;
}

function scaleBytes(value: Decimal, base: 1000 | 1024, units: readonly string[], fixed: number | undefined): {
	quantity: Decimal;
	unit: string;
} {
	const power = fixed ?? (value.isFinite() ? selectByteUnit(value, base, units.length) : 0);
	const quantity = base === 1000
		? value.shift(-3 * power)
		: dividePowerOfTwo(value, 10 * power);

	return {
		quantity: normalizeNumericRange(quantity),
		unit: units[power]
	};
}
export const byteDomain: NumericDomain = {
	prepare(spec, context, formatter)
	{
		const options = spec as BytesFormatSpec;
		const base = options.byteBase ?? 1024;
		const decimal = base === 1000;
		const units = decimal ? BYTE_UNITS_1000 : BYTE_UNITS_1024;
		const fixed = options.byteExponent;

		return {
			metadata(quantity, raw, parts)
			{
				const unit = parts.find(part => part.type === "unit")?.value;
				const power = unit === undefined ? fixed ?? 0 : units.indexOf(unit);
				const exponent = power * (decimal ? 3 : 10);
				const rounded = renderedNumericQuantity(quantity, spec, context, raw, parts);
				return {
					quantity: decimal ? rounded.shift(exponent) : multiplyPowerOfTwo(rounded, exponent),
					scale: {
						kind: decimal ? "decimal" : "binary", exponent
					}
				};
			},
			render(source, capture)
			{
				const scaled = scaleBytes(source, base, units, fixed);
				const tokens = tokensFromIntlParts(formatIntlParts(formatter, scaled.quantity, spec, capture));

				return source.isFinite() ? [...tokens, { type: "literal", value: " " }, { type: "unit", value: scaled.unit }] : tokens;
			},
			string(source)
			{
				const scaled = scaleBytes(source, base, units, fixed);

				return intlFormat(formatter, scaled.quantity.toValue()) + (source.isFinite() ? " " + scaled.unit : "");
			},
			automatic: fixed === undefined,
			select(values)
			{
				let exponent = 0;

				for (const value of values)
				{
					if (value.isFinite())
					{
						exponent = Math.max(exponent, selectByteUnit(value, base, units.length));
					}
				}

				return immutableSnapshot({ ...numericSpecOptions(spec), byteExponent: exponent });
			},
		};
	},
};
