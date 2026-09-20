import type { Decimal } from "@neutrium/decimal/arithmetic";
import type { FormatContext } from "../../core/codec.js";
import { immutableSnapshot } from "../../core/immutable-snapshot.js";
import type { FormatToken } from "../../core/tokens.js";
import { compactAffix, compactMagnitude, findCompactMagnitude } from "./compact.js";
import { decimalOrder, normalizeNumericRange } from "../shared/decimal-string.js";
import type { CaptureParts, NumericDomain } from "../shared/engine.js";
import { applyPartOverrides, createNumberFormat, formatIntlParts, intlFormat, tokensFromIntlParts } from "../shared/intl-format.js";
import { renderedNumericQuantity } from "../shared/metadata.js";
import { numericSpecOptions } from "../shared/options.js";
import { displayedCompactExponent } from "./presentation.js";
import { displayedCoefficient, omittedUnitCoefficient } from "../shared/coefficient.js";
import type { NumericFormatSpec } from "../specs.js";

const NUMERIC_PARTS = new Set<Intl.NumberFormatPartTypes>(["integer", "group", "decimal", "fraction", "exponentSeparator", "exponentMinusSign", "exponentInteger"]);

function formatFixedCompact(
	quantity: Decimal,
	spec: Extract<NumericFormatSpec, { kind: "number" | "currency" | "unit";}>,
	context: FormatContext,
	capture: CaptureParts | undefined,
	formatter: Intl.NumberFormat,
	magnitude: ReturnType<typeof compactMagnitude>
): readonly FormatToken[]
{
	if (!quantity.isFinite())
	{
		return tokensFromIntlParts(formatIntlParts(formatter, quantity, spec, capture));
	}

	const exponent = spec.compactExponent as number;
	const scaled = normalizeNumericRange(quantity.shift(-exponent));
	let raw: readonly Intl.NumberFormatPart[] = [];
	const parts = formatIntlParts(formatter, scaled, spec, captured => {
		raw = captured;
		capture?.(captured);
	});
	// Preserve the actual rounded digits and visible precision, before overrides.
	// Singular/dual unit forms without numerals use the shared coefficient fallback.
	const displayed = displayedCoefficient(raw, spec, context) ?? omittedUnitCoefficient(scaled, spec, context);
	const affix = compactAffix(magnitude, spec, context, exponent, displayed, scaled.isNeg());

	if (spec.kind === "unit" && affix.template && !parts.some(part => NUMERIC_PARTS.has(part.type)))
	{
		// A standalone singular/dual unit can suppress the entire numeric body.
		// Compact output needs that body; retain the native compact unit placement.
		const numberSpec = { ...numericSpecOptions(spec), kind: "number" as const };
		const number = formatIntlParts(createNumberFormat(numberSpec, context), scaled, numberSpec, capture);

		return tokensFromIntlParts(applyPartOverrides([
			...affix.template.prefix, ...number, ...affix.template.suffix,
		], spec));
	}

	for (const part of parts)
	{
		if (part.type === "unit" && spec.kind === "unit" && spec.unitSymbol === undefined && affix.unit !== undefined)
		{
			part.value = affix.unit;
		}

		if (part.type === "currency" && spec.kind === "currency" && spec.currencySymbol === undefined && affix.currency !== undefined)
		{
			part.value = affix.currency;
		}
	}

	const index = affix.position === "prefix"
		? parts.findIndex((part) => NUMERIC_PARTS.has(part.type))
		: parts.reduce((last, part, current) => NUMERIC_PARTS.has(part.type) ? current + 1 : last, 0);
	parts.splice(index, 0, ...affix.parts);

	return tokensFromIntlParts(affix.omitNumber ? parts.filter((part) => !NUMERIC_PARTS.has(part.type)) : parts);
}

function sharedCompactExponent(
	values: Iterable<Decimal>,
	spec: Extract<NumericFormatSpec, { kind: "number" | "currency" | "unit" }>,
	context: FormatContext
): number | undefined
{
	let order = 0;

	for (const quantity of values)
	{
		if (quantity.isFinite())
		{
			order = Math.max(order, decimalOrder(quantity));
		}
	}

	let selected: number | undefined;

	for (let exponent = 1; exponent <= Math.min(order, 100); exponent += 1)
	{
		if (findCompactMagnitude(spec, context, exponent))
		{
			selected = exponent;
		}
	}

	return selected;
}

export const nativeDomain: NumericDomain = {
	prepare(spec, context, formatter)
	{
		const options = spec as Extract<NumericFormatSpec, { kind: "number" | "currency" | "unit" }>;
		const exponent = options.compactExponent;
		const magnitude = exponent === undefined ? undefined : compactMagnitude(options, context, exponent);

		return {
			metadata(quantity, raw, parts)
			{
				const compact = exponent ?? (options.notation === "compact" ? displayedCompactExponent(raw, spec, context) : undefined);
				const rounded = renderedNumericQuantity(quantity, spec, context, raw, parts);
				return compact === undefined ? { quantity: rounded } : {
					quantity: rounded.shift(compact), scale: { kind: "decimal", exponent: compact },
				};
			},
			render: magnitude
				? (source, capture) => formatFixedCompact(source, options, context, capture, formatter, magnitude)
				: (source, capture) => tokensFromIntlParts(formatIntlParts(formatter, source, spec, capture)),
			string: magnitude ? undefined : source => intlFormat(formatter, source.toValue()), automatic: options.notation === "compact" && exponent === undefined,
			select(values)
			{
				const selected = sharedCompactExponent(values, options, context);
				return immutableSnapshot(selected === undefined
					? { ...numericSpecOptions(spec), notation: "standard" }
					: { ...numericSpecOptions(spec), compactExponent: selected });
			},
		};
	},
};
