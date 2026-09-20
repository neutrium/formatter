import { isImmutableSnapshot } from "../core/immutable-snapshot.js";
import { DurationFormatSpec } from "./spec.js";
import { isRoundingMode } from "../numeric/shared/decimal-string.js";
import { DURATION_DATE_UNITS, DURATION_SUBSECOND_UNITS, DURATION_TIME_UNITS } from "./descriptors.js";

type Rule = (value: unknown) => boolean;
/** Forwarded options require localized presentation; unmarked options belong to the wrapper. */
type OptionRule = readonly [validate: Rule, forwardToIntl?: true];
const string: Rule = value => typeof value === "string";
const oneOf = (...values: readonly string[]): Rule => value => typeof value === "string" && values.includes(value);
const display = oneOf("auto", "always");

function componentRules<Unit extends string>(units: readonly Unit[], style: Rule): Record<Unit | `${Unit}Display`, OptionRule>
{
	return Object.fromEntries<OptionRule>(units.flatMap(unit => [
		[unit, [style, true] as const], [`${unit}Display`, [display, true] as const],
	])) as Record<Unit | `${Unit}Display`, OptionRule>;
}

const RULES = {
	kind: [oneOf("duration")],
	presentation: [oneOf("elapsed", "localized")],
	locale: [string],
	inputUnit: [oneOf("seconds", "milliseconds")],
	roundingMode: [isRoundingMode],
	signDisplay: [oneOf("auto", "always", "exceptZero", "negative", "never")],
	negativeDisplay: [oneOf("sign", "parentheses")],
	numberingSystem: [string, true],
	style: [oneOf("long", "short", "narrow", "digital"), true],
	fractionalDigits: [value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 9, true],
	...componentRules(DURATION_DATE_UNITS, oneOf("long", "short", "narrow")),
	...componentRules(DURATION_TIME_UNITS, oneOf("long", "short", "narrow", "numeric", "2-digit")),
	...componentRules(DURATION_SUBSECOND_UNITS, oneOf("long", "short", "narrow", "numeric")),
} satisfies Record<keyof DurationFormatSpec, OptionRule>;
const RULE_ENTRIES = Object.entries<OptionRule>(RULES);
const INTL_NAMES = RULE_ENTRIES.filter(([, [, forward]]) => forward).map(([name]) => name as keyof DurationFormatSpec);
const VALIDATED_DURATION_SPECS = new WeakSet<object>();

/** Capture and validate caller options once; only library-owned snapshots can bypass validation. */
export function normalizeDurationSpec(spec: DurationFormatSpec): DurationFormatSpec
{
	const immutable = isImmutableSnapshot(spec);

	if (immutable && VALIDATED_DURATION_SPECS.has(spec))
	{
		return spec;
	}

	for (const key of Reflect.ownKeys(spec))
	{
		if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(RULES, key))
		{
			throw new RangeError(`Unknown duration format option: ${String(key)}`);
		}
	}

	const options: Record<string, unknown> = {};
	// Include inherited and non-enumerable values, without retaining accessors.
	for (const [name, [validate]] of RULE_ENTRIES)
	{
		const value = spec[name as keyof DurationFormatSpec];

		if (value === undefined) continue;

		if (!validate(value))
		{
			throw new RangeError(`Invalid duration format option: ${name}`);
		}

		options[name] = value;
	}

	if (options.presentation === undefined)
	{
		throw new RangeError("Duration presentation must be elapsed or localized");
	}

	if (options.locale !== undefined)
	{
		Intl.getCanonicalLocales(options.locale as string);
	}

	if (options.presentation === "elapsed")
	{
		for (const name of INTL_NAMES)
		{
			if (options[name] !== undefined)
			{
				throw new RangeError(`Duration ${name} requires localized presentation`);
			}
		}
	}

	if (immutable)
	{
		VALIDATED_DURATION_SPECS.add(spec);
	}

	return immutable ? spec : Object.freeze(options) as unknown as DurationFormatSpec;
}

/** Map normalized options using the descriptors that also enforce their presentation scope. */
export function durationFormatOptions(spec: DurationFormatSpec): Record<string, unknown>
{
	const options: Record<string, unknown> = {};

	for (const name of INTL_NAMES)
	{
		const value = spec[name];
		if (value !== undefined)
		{
			options[name] = value;
		}
	}

	return options;
}
