import type { Decimal } from "@neutrium/decimal/arithmetic";
import { isImmutableSnapshot } from "../../core/immutable-snapshot.js";
import { FormatToken, RangeFormatToken, RangeTokenSource } from "../../core/tokens.js";
import { FormatContext } from "../../core/codec.js";
import { NumericDisplayOptions } from "../../types.js";
import { NumericFormatSpec } from "../specs.js";
import { numberFormatOptions } from "./options.js";
import { LruCache } from "../../core/cache.js";
import { requireExactDecimalStrings } from "./runtime-checks.js";

type IntlNumeric = number | bigint | string;

export interface IntlNumberRangePart extends Intl.NumberFormatPart
{
	source: RangeTokenSource;
}

const MAGNITUDE_PARTS = new Set<Intl.NumberFormatPartTypes>([
	"integer",
	"group",
	"decimal",
	"fraction",
	"nan",
	"infinity",
	"exponentSeparator",
	"exponentMinusSign",
	"exponentInteger",
	"compact",
]);

const FORMATTERS = new WeakMap<FormatContext, LruCache<string, Intl.NumberFormat>>();
const SNAPSHOT_FORMATTERS = new WeakMap<FormatContext, WeakMap<object, Intl.NumberFormat>>();

export function localeFor(spec: NumericDisplayOptions, context: FormatContext): string
{
	return Intl.getCanonicalLocales(spec.locale || context.locale)[0];
}

export function createNumberFormat(
	spec: NumericFormatSpec,
	context: FormatContext,
	configuration?: { locale: string; options: ReturnType<typeof numberFormatOptions> }
): Intl.NumberFormat
{
	requireExactDecimalStrings();

	if (isImmutableSnapshot(spec))
	{
		let bySpec = SNAPSHOT_FORMATTERS.get(context);

		if (!bySpec)
		{
			bySpec = new WeakMap();
			SNAPSHOT_FORMATTERS.set(context, bySpec);
		}

		const existing = bySpec.get(spec);

		if (existing)
		{
			return existing;
		}
	}

	const locale = configuration?.locale ?? localeFor(spec, context);
	const options = configuration?.options ?? numberFormatOptions(spec);
	let cache = FORMATTERS.get(context);

	if (!cache)
	{
		cache = new LruCache(256);
		FORMATTERS.set(context, cache);
	}

	const key = JSON.stringify([locale, options]);
	let formatter = cache.get(key);

	if (!formatter)
	{
		formatter = new Intl.NumberFormat(locale, options);
		cache.set(key, formatter);
	}

	if (isImmutableSnapshot(spec))
	{
		SNAPSHOT_FORMATTERS.get(context)!.set(spec, formatter);
	}

	return formatter;
}

export function intlFormatToParts(formatter: Intl.NumberFormat, value: IntlNumeric): Intl.NumberFormatPart[]
{
	return (formatter.formatToParts as (input: IntlNumeric) => Intl.NumberFormatPart[])(value);
}

export function intlFormat(formatter: Intl.NumberFormat, value: IntlNumeric): string
{
	return (formatter.format as (input: IntlNumeric) => string)(value);
}

export function intlFormatRangeToParts(
	formatter: Intl.NumberFormat,
	start: IntlNumeric,
	end: IntlNumeric,
): IntlNumberRangePart[] | null
{
	const method = (formatter as unknown as {
		formatRangeToParts?: (rangeStart: IntlNumeric, rangeEnd: IntlNumeric) => IntlNumberRangePart[];
	}).formatRangeToParts;
	return method ? method.call(formatter, start, end) : null;
}

function replaceMagnitude(
	parts: readonly Intl.NumberFormatPart[],
	display: string,
): Intl.NumberFormatPart[]
{
	const output: Intl.NumberFormatPart[] = [];
	let inserted = false;

	for (const part of parts)
	{
		if (MAGNITUDE_PARTS.has(part.type))
		{
			if (!inserted)
			{
				output.push({ type: "literal", value: display });
				inserted = true;
			}

			continue;
		}
		output.push(part);
	}
	return output;
}

export function applyPartOverrides(
	parts: readonly Intl.NumberFormatPart[],
	spec: NumericFormatSpec,
): Intl.NumberFormatPart[]
{
	return parts.map((part) => {
		if (part.type === "group" && spec.groupSeparator !== undefined)
			return { ...part, value: spec.groupSeparator };
		if (part.type === "decimal" && spec.decimalSeparator !== undefined)
			return { ...part, value: spec.decimalSeparator };
		if (part.type === "currency" && spec.kind === "currency" && spec.currencySymbol !== undefined)
			return { ...part, value: spec.currencySymbol };
		if (part.type === "unit" && spec.kind === "unit" && spec.unitSymbol !== undefined)
			return { ...part, value: spec.unitSymbol };
		if (part.type === "percentSign" && spec.kind === "percentage" && spec.percentageSymbol !== undefined)
			return { ...part, value: spec.percentageSymbol };
		return part;
	});
}

export function formatIntlParts(
	formatter: Intl.NumberFormat,
	quantity: Decimal,
	spec: NumericFormatSpec,
	capture?: (parts: readonly Intl.NumberFormatPart[]) => void,
): Intl.NumberFormatPart[]
{
	const raw = intlFormatToParts(formatter, quantity.toValue());
	capture?.(raw);
	let parts = applyPartOverrides(raw, spec);

	if (quantity.isNaN() && spec.nanDisplay !== undefined)
	{
		parts = replaceMagnitude(parts, spec.nanDisplay);
	}
	else if (!quantity.isFinite() && !quantity.isNaN() && spec.infinityDisplay !== undefined)
	{
		parts = replaceMagnitude(parts, spec.infinityDisplay);
	}

	return parts;
}

function tokenFromIntlPart(part: Intl.NumberFormatPart): FormatToken
{
	switch (part.type)
	{
		case "plusSign":
		case "minusSign":
		case "exponentMinusSign":
			return { type: part.type === "exponentMinusSign" ? "exponentSign" : "sign", value: part.value };
		case "currency": return { type: "currency", value: part.value };
		case "integer": return { type: "integer", value: part.value };
		case "group": return { type: "group", value: part.value };
		case "decimal": return { type: "decimal", value: part.value };
		case "fraction": return { type: "fraction", value: part.value };
		case "exponentSeparator": return { type: "exponentSeparator", value: part.value };
		case "exponentInteger": return { type: "exponentInteger", value: part.value };
		case "compact":
		case "percentSign":
		case "unit":
			return { type: "unit", value: part.value };
		default: return { type: "literal", value: part.value };
	}
}

export function tokensFromIntlParts(parts: readonly Intl.NumberFormatPart[]): readonly FormatToken[]
{
	return parts.map(tokenFromIntlPart);
}

export function tokensFromIntlRangeParts(parts: readonly IntlNumberRangePart[]): readonly RangeFormatToken[]
{
	return parts.map((part) => ({ ...tokenFromIntlPart(part), source: part.source }));
}
