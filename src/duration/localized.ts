import { FormatToken, renderTokens } from "../core/tokens.js";
import { parseQuantity, roundQuantityToInteger } from "../numeric/shared/decimal-string.js";
import { NumericValue } from "../types.js";
import { durationSigns } from "./signs.js";
import { DurationFormatSpec, DurationRecordValue, DurationValue } from "./spec.js";
import { DURATION_UNITS, DurationUnit } from "./descriptors.js";
import { durationFormatOptions } from "./options.js";
import { LruCache } from "../core/cache.js";

type DurationRecord = Record<DurationUnit, number>;
type SingularDurationUnit =
	| "year" | "month" | "week" | "day" | "hour"
	| "minute" | "second" | "millisecond" | "microsecond" | "nanosecond";

const PLURAL_UNIT: Record<SingularDurationUnit, DurationUnit> = {
	year: "years",
	month: "months",
	week: "weeks",
	day: "days",
	hour: "hours",
	minute: "minutes",
	second: "seconds",
	millisecond: "milliseconds",
	microsecond: "microseconds",
	nanosecond: "nanoseconds",
};

interface IntlDurationPart
{
	type: string;
	value: string;
	unit?: SingularDurationUnit;
}

interface IntlDurationFormatter
{
	format(value: DurationRecord): string;
	formatToParts(value: DurationRecord): IntlDurationPart[];
	resolvedOptions(): Record<string, unknown>;
}

interface IntlDurationFormatConstructor
{
	new(locales?: string, options?: Record<string, unknown>): IntlDurationFormatter;
}

interface NormalizedDuration
{
	record: DurationRecord;
	negative: boolean;
	zero: boolean;
	special: "NaN" | "Infinity" | null;
}

const FORMATTERS = new LruCache<string, IntlDurationFormatter>(128);
const LOCALIZED_SIGNS = new LruCache<string, readonly FormatToken[]>(128);

function emptyRecord(): DurationRecord
{
	return {
		years: 0,
		months: 0,
		weeks: 0,
		days: 0,
		hours: 0,
		minutes: 0,
		seconds: 0,
		milliseconds: 0,
		microseconds: 0,
		nanoseconds: 0,
	};
}

function isDurationRecord(value: DurationValue): value is DurationRecordValue
{
	return typeof value === "object" && value !== null && !("toValue" in value);
}

function normalizeRecord(value: DurationRecordValue, zeroThreshold: bigint): NormalizedDuration
{
	const record = emptyRecord();
	let supplied = false;
	let sign = 0;

	for (const unit of DURATION_UNITS)
	{
		const input = value[unit];
		if (input === undefined) continue;

		supplied = true;

		if (!Number.isSafeInteger(input))
		{
			throw new RangeError(`Duration ${unit} must be a safe integer`);
		}

		if (input < 0)
		{
			if (sign > 0)
			{
				throw new RangeError("Duration fields must have a consistent sign");
			}

			sign = -1;
		}
		else if (input > 0)
		{
			if (sign < 0)
			{
				throw new RangeError("Duration fields must have a consistent sign");
			}

			sign = 1;
		}

		record[unit] = Math.abs(input);
	}

	if (!supplied)
	{
		throw new TypeError("A duration record must contain at least one duration field");
	}

	if (record.years >= 2 ** 32 || record.months >= 2 ** 32 || record.weeks >= 2 ** 32)
	{
		throw new RangeError("Duration years, months, and weeks must be less than 2^32");
	}

	const normalizedNanoseconds = (BigInt(record.days) * 86400n + BigInt(record.hours) * 3600n +
		BigInt(record.minutes) * 60n + BigInt(record.seconds)) * 1_000_000_000n +
		BigInt(record.milliseconds) * 1_000_000n + BigInt(record.microseconds) * 1000n + BigInt(record.nanoseconds);

	if (normalizedNanoseconds >= (2n ** 53n) * 1_000_000_000n)
	{
		throw new RangeError("Normalized duration seconds must be less than 2^53");
	}

	// Intl truncates numeric subsecond groups. Calendar fields and independently
	// displayed larger units must still prevent the presentation from being zero.
	const zero = record.years === 0 && record.months === 0 && record.weeks === 0 && normalizedNanoseconds < zeroThreshold;

	return { record, negative: sign < 0, zero, special: null };
}

function normalizeScalar(value: NumericValue, spec: DurationFormatSpec): NormalizedDuration
{
	let quantity = parseQuantity(value);

	if (spec.inputUnit === "milliseconds")
	{
		quantity = quantity.shift(-3);
	}

	if (!quantity.isFinite())
	{
		return { record: emptyRecord(), negative: quantity.isNeg(), zero: false, special: quantity.isNaN() ? "NaN" : "Infinity" };
	}

	const precision = spec.fractionalDigits ?? 9;
	const rounded = roundQuantityToInteger(quantity.shift(precision), spec.roundingMode);
	const ticks = BigInt(rounded.abs().toFixed());
	const nanoseconds = ticks * (10n ** BigInt(9 - precision));
	const wholeSeconds = nanoseconds / 1_000_000_000n;

	if (wholeSeconds >= 2n ** 53n)
	{
		throw new RangeError("Localized scalar durations must contain fewer than 2^53 seconds");
	}

	const record = emptyRecord();
	record.hours = Number(wholeSeconds / 3600n);
	const remainder = Number(wholeSeconds % 3600n);
	record.minutes = Math.floor(remainder / 60);
	record.seconds = remainder % 60;
	let fraction = nanoseconds % 1_000_000_000n;
	record.milliseconds = Number(fraction / 1_000_000n);
	fraction %= 1_000_000n;
	record.microseconds = Number(fraction / 1_000n);
	record.nanoseconds = Number(fraction % 1_000n);

	return {
		record,
		negative: rounded.isNeg(),
		zero: nanoseconds === 0n,
		special: null,
	};
}

function normalizeDuration(value: DurationValue, spec: DurationFormatSpec, zeroThreshold: bigint): NormalizedDuration
{
	return isDurationRecord(value) ? normalizeRecord(value, zeroThreshold) : normalizeScalar(value, spec);
}

function localizedSign(locale: string, numberingSystem: string | undefined, negative: boolean): FormatToken[]
{
	const key = JSON.stringify([locale, numberingSystem, negative]);
	let tokens = LOCALIZED_SIGNS.get(key);

	if (!tokens)
	{
		const formatter = new Intl.NumberFormat(locale, { numberingSystem, signDisplay: "always", useGrouping: false });
		const output: FormatToken[] = [];

		for (const part of formatter.formatToParts(negative ? -1 : 1))
		{
			if (part.type === "integer")
			{
				break;
			}

			output.push({
				type: part.type === "minusSign" || part.type === "plusSign" ? "sign" : "literal",
				value: part.value,
			});
		}

		tokens = LOCALIZED_SIGNS.set(key, output.length > 0 ? output : [{ type: "sign", value: negative ? "-" : "+" }]);
	}

	// Public parts are caller-owned; never expose cached token objects.
	return tokens.map(token => ({ ...token }));
}

function requireDurationFormat(): IntlDurationFormatConstructor
{
	const Constructor = (Intl as unknown as { DurationFormat?: IntlDurationFormatConstructor }).DurationFormat;

	if (typeof Constructor !== "function")
	{
		throw new RangeError("Localized durations require Intl.DurationFormat; upgrade the runtime or load an Intl.DurationFormat polyfill before importing the formatter");
	}

	return Constructor;
}

function tokenFromDurationPart(part: IntlDurationPart): FormatToken
{
	switch (part.type)
	{
		case "plusSign":
		case "minusSign":
			return { type: "sign", value: part.value };
		case "unit":
			return { type: "unit", value: part.value };
		case "decimal":
			return { type: "decimal", value: part.value };
		case "fraction":
			return { type: "fraction", value: part.value };
		case "integer":
			return part.unit
				? { type: PLURAL_UNIT[part.unit], value: part.value }
				: { type: "literal", value: part.value };
		default:
			return { type: "literal", value: part.value };
	}
}

/** Retain the native service and its options for all operations on one bound spec. */
export function prepareLocalizedDuration(spec: DurationFormatSpec, locale: string)
{
	const Constructor = requireDurationFormat();
	const requestedOptions = durationFormatOptions(spec);
	const key = JSON.stringify([locale, requestedOptions]);
	const formatter = FORMATTERS.get(key) ?? FORMATTERS.set(key, new Constructor(locale, requestedOptions));
	const resolvedOptions = formatter.resolvedOptions();
	// The first numeric subsecond unit is folded into its predecessor. Bind the
	// smallest visible quantum once; determining zero needs no extra Intl render.
	const fractionPlaces = resolvedOptions.milliseconds === "numeric" ? 9 :
		resolvedOptions.microseconds === "numeric" ? 6 : resolvedOptions.nanoseconds === "numeric" ? 3 : 0;
	const zeroThreshold = 10n ** BigInt(Math.max(0, fractionPlaces - Number(resolvedOptions.fractionalDigits ?? fractionPlaces)));

	function prepareValue(value: DurationValue)
	{
		// A compiled plan must still reject a service removed from the runtime.
		requireDurationFormat();
		const normalized = normalizeDuration(value, spec, zeroThreshold);
		const signs = durationSigns(normalized.negative, normalized.zero, spec,
			negative => localizedSign(locale, spec.numberingSystem, negative));
		return { ...normalized, ...signs };
	}

	return {
		intl: { service: "DurationFormat" as const, requestedOptions, resolvedOptions },
		format(value: DurationValue): readonly FormatToken[] {
			const { record, special, prefix, suffix } = prepareValue(value);
			const parts = special === null ? formatter.formatToParts(record).map(tokenFromDurationPart)
				: [{ type: "literal", value: special } as FormatToken];
			return [...prefix, ...parts, ...suffix];
		},
		formatString(value: DurationValue): string {
			const { record, special, prefix, suffix } = prepareValue(value);
			return renderTokens(prefix) + (special ?? formatter.format(record)) + renderTokens(suffix);
		},
	};
}
