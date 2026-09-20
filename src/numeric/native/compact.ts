import type { FormatContext } from "../../core/codec.js";
import { LruCache } from "../../core/cache.js";
import { decimalOrder, parseQuantity } from "../shared/decimal-string.js";
import { createNumberFormat, intlFormatToParts, localeFor } from "../shared/intl-format.js";
import { numberFormatOptions, numericSpecOptions } from "../shared/options.js";
import { displayedCoefficient } from "../shared/coefficient.js";
import { neutralCompactFormatter } from "./presentation.js";
import type { NumericFormatSpec } from "../specs.js";
import { MAX_COMPACT_EXPONENT } from "../shared/options.js";
import { cardinalSelector } from "./cardinals.js";
import { COMPACT_PATTERN_SAMPLES } from "./compact-samples.js";

const NUMERIC_PARTS = new Set<Intl.NumberFormatPartTypes>(["integer", "group", "decimal", "fraction", "exponentSeparator", "exponentMinusSign", "exponentInteger"]);

// Null caches a successfully probed exponent that is not a compact magnitude.
const COMPACT_MAGNITUDES = new LruCache<string, CompactMagnitude | null>(256);

/** One fixed scale, with native width discovery and precision-specific grammatical patterns. */
interface CompactMagnitude
{
	readonly neutral: Intl.NumberFormat;
	readonly widths: Map<number, number>;
	readonly probeFormatters: Map<number, Intl.NumberFormat>;
	readonly select: ReturnType<typeof cardinalSelector>;
	readonly integerZeroCategory: Intl.LDMLPluralRule;
	readonly fallback: CompactAffix;
	readonly affixes: Map<string, CompactAffix>;
}

interface CompactAffix
{
	readonly position: "prefix" | "suffix";
	readonly omitNumber: boolean;
	readonly unit?: string;
	readonly currency?: string;
	readonly parts: readonly Intl.NumberFormatPart[];
	readonly template?: { prefix: readonly Intl.NumberFormatPart[]; suffix: readonly Intl.NumberFormatPart[] };
}

function extractCompactAffix(parts: readonly Intl.NumberFormatPart[]): CompactAffix | undefined
{
	const compactIndex = parts.findIndex((part) => part.type === "compact");

	if (compactIndex < 0)
	{
		return undefined;
	}

	const firstNumeric = parts.findIndex((part) => NUMERIC_PARTS.has(part.type));
	// Some presentations contain only a word, e.g. French "mille".
	if (firstNumeric < 0)
	{
		return {
			position: "suffix",
			omitNumber: true,
			parts: parts.filter((part) => part.type === "compact" || part.type === "literal")
		};
	}
	let lastNumeric = firstNumeric;

	for (let index = firstNumeric; index < parts.length; index += 1)
	{
		if (NUMERIC_PARTS.has(parts[index].type))
		{
			lastNumeric = index;
		}
	}

	const position = compactIndex < firstNumeric ? "prefix" : "suffix";
	const start = position === "prefix" ? compactIndex : lastNumeric + 1;
	const end = position === "prefix" ? firstNumeric : compactIndex + 1;

	return {
		position,
		omitNumber: false,
		unit: parts.find((part) => part.type === "unit")?.value,
		currency: parts.find((part) => part.type === "currency")?.value,
		template: { prefix: parts.slice(0, firstNumeric), suffix: parts.slice(lastNumeric + 1) },
		parts: parts.slice(start, end).filter((part) => part.type === "compact" || part.type === "literal"),
	};
}

export function compactMagnitude(
	spec: Extract<NumericFormatSpec, { kind: "number" | "currency" | "unit" }>,
	context: FormatContext,
	exponent: number,
): CompactMagnitude
{
	const result = findCompactMagnitude(spec, context, exponent);
	if (!result)
	{
		throw new RangeError(`compactExponent ${exponent} does not start a compact magnitude for ${localeFor(spec, context)}`);
	}

	return result;
}

export function findCompactMagnitude(
	spec: Extract<NumericFormatSpec, { kind: "number" | "currency" | "unit" }>,
	context: FormatContext,
	exponent: number,
): CompactMagnitude | null
{
	if (!Number.isSafeInteger(exponent) || exponent <= 0 || exponent > MAX_COMPACT_EXPONENT)
	{
		throw new RangeError(`compactExponent must be an integer from 1 to ${MAX_COMPACT_EXPONENT}`);
	}

	const locale = localeFor(spec, context);
	const options = numberFormatOptions(spec);
	const key = JSON.stringify([locale, options, exponent]);
	let result = COMPACT_MAGNITUDES.get(key);

	if (result === undefined)
	{
		const neutral = neutralCompactFormatter(spec, context);
		const probe = intlFormatToParts(neutral, `2E${exponent}`);
		const fallback = extractCompactAffix(probe);

		if (!fallback)
		{
			return COMPACT_MAGNITUDES.set(key, null);
		}

		// A neutral coefficient of two proves this is a magnitude boundary, even
		// when the unscaled unit pattern would omit its numeral (Arabic duals).
		if (displayedCoefficient(probe, spec, context) !== "2")
		{
			return COMPACT_MAGNITUDES.set(key, null);
		}

		const select = cardinalSelector(neutral.resolvedOptions().locale);
		result = {
			neutral,
			widths: new Map(),
			probeFormatters: new Map(),
			// Classify rendered decimals exactly; never round a surrogate operand.
			select,
			integerZeroCategory: select("0"),
			fallback,
			affixes: new Map(),
		};
		COMPACT_MAGNITUDES.set(key, result);
	}

	return result;
}

export function compactAffix(
	magnitude: CompactMagnitude,
	spec: Extract<NumericFormatSpec, { kind: "number" | "currency" | "unit" }>,
	context: FormatContext,
	exponent: number,
	displayed: string,
	negative: boolean,
): CompactAffix
{
	const category = magnitude.select(displayed);
	const single = /^0*1(?:\.0*)?$/.test(displayed);
	const zero = /^0+(?:\.0*)?$/.test(displayed);
	const width = patternWidth(magnitude, spec, context, exponent, Math.max(1, decimalOrder(parseQuantity(displayed)) + 1));
	const key = `${width}:${category}:${single}:${zero}:${negative}`;
	const cached = magnitude.affixes.get(key);

	if (cached)
	{
		return cached;
	}

	const fraction = displayed.split(".")[1] ?? "";
	const witnessFractions = fractionWitnesses(fraction);
	const fractionDigits = witnessFractions[0].length;
	let probeFormatter = magnitude.probeFormatters.get(fractionDigits);

	if (!probeFormatter)
	{
		// Witnesses describe the displayed grammar, not the source's precision
		// policy. Freeze its visible fraction width; never reapply increments or
		// significant-digit rounding to a smaller representative coefficient.
		probeFormatter = createNumberFormat({ ...numericSpecOptions(spec), compactExponent: undefined, notation: "compact",
			minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits,
			minimumSignificantDigits: undefined, maximumSignificantDigits: undefined,
			roundingIncrement: 1, roundingPriority: "auto", trailingZeroDisplay: "auto", signDisplay: "never" }, context);
		magnitude.probeFormatters.set(fractionDigits, probeFormatter);
	}

	if (zero && category === magnitude.integerZeroCategory)
	{
		// Zero can have a distinct compact pattern even within its plural category.
		// Padding need not change that category (Latvian), but when it does (Russian),
		// retain the precision-aware probes below instead of borrowing integer grammar.
		const probe = intlFormatToParts(neutralCompactFormatter(spec, context, true), `1E${exponent}`);
		const affix = extractCompactAffix(probe);

		if (affix)
		{
			magnitude.affixes.set(key, affix); return affix;
		}
	}
	// A plural category is reusable only within its coefficient-width pattern.
	// If the requested category cannot occur at that width, borrow the nearest
	// narrower pattern with that category, without changing the fixed magnitude.
	for (let probeWidth = width; probeWidth >= 1; probeWidth--)
	{
		for (const candidate of compactPatternCoefficients(probeWidth, witnessFractions))
		{
			if (magnitude.select(candidate) !== category) continue;

			const probe = intlFormatToParts(probeFormatter, `${negative ? "-" : ""}${candidate}E${exponent}`);
			const rendered = displayedCoefficient(probe, spec, context);

			if (rendered !== undefined)
			{
				const renderedOrder = decimalOrder(parseQuantity(rendered));

				if (Math.max(1, renderedOrder + 1) !== probeWidth ||
					renderedOrder !== decimalOrder(parseQuantity(candidate))) continue;
			}

			const affix = extractCompactAffix(probe);

			if (!affix || (affix.omitNumber && !single)) continue;

			magnitude.affixes.set(key, affix);

			return affix;
		}
	}
	// Some categories (notably Arabic zero) have no non-zero compact probe.
	magnitude.affixes.set(key, magnitude.fallback);

	return magnitude.fallback;
}

/** Resolve the widest native pattern at or below the requested coefficient width. */
function patternWidth(magnitude: CompactMagnitude, spec: NumericFormatSpec, context: FormatContext, exponent: number, requested: number): number
{
	const cached = magnitude.widths.get(requested);

	if (cached !== undefined) return cached;

	let width = requested;

	for (; width > 1; width--)
	{
		const probe = intlFormatToParts(magnitude.neutral, `1E${exponent + width - 1}`);
		const coefficient = displayedCoefficient(probe, spec, context);

		if (coefficient !== undefined && decimalOrder(parseQuantity(coefficient)) === width - 1 && extractCompactAffix(probe))
		{
			break;
		}
	}
	magnitude.widths.set(requested, width);
	return width;
}

/** Search a width's shared grammar samples first, then less common plural operands. */
function* compactPatternCoefficients(width: number, fractions: readonly string[]): Generator<string>
{
	for (const sample of COMPACT_PATTERN_SAMPLES)
	{
		if (!sample.includes(".") && sample.length === width)
		{
			for (const fraction of fractions)
			{
				yield sample + (fraction ? `.${fraction}` : "");
			}
		}
	}

	const base = 10n ** BigInt(width - 1);
	const end = base * 10n;

	for (let offset = 0n; offset < 200n && base + offset < end; offset++)
	{
		const integer = String(base + offset);

		for (const fraction of fractions)
		{
			yield integer + (fraction ? `.${fraction}` : "");
		}
	}
}

/** Intl's fixed-fraction limit is 100, even though significant formatting can
 * display more places. These are only witnesses: each must pass exact category
 * equality before its affix can be used; the original operands are never reduced. */
function fractionWitnesses(fraction: string): readonly string[]
{
	if (fraction.length <= 100)
	{
		return [fraction];
	}

	const trimmed = fraction.replace(/0+$/, "");
	const trailing = Math.min(80, fraction.length - trimmed.length);

	return [
		...new Set([
			fraction.slice(-100),
			(trimmed.slice(-20) + "0".repeat(trailing)).padStart(100, "0"),
			...["1", "2", "3", "5", "11", "21"].flatMap(value => [value.padStart(100, "0"), value.padEnd(100, "0")]),
		])
	];
}
