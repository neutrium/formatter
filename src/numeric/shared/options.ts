import { NumericDisplayOptions } from "../../types.js";
import { isRoundingMode } from "./decimal-string.js";
import { NumericFormatSpec } from "../specs.js";
import { PLURAL_CATEGORIES } from "../../localization/plural-categories.js";
import { isImmutableSnapshot } from "../../core/immutable-snapshot.js";

type ModernNumberFormatOptions = Intl.NumberFormatOptions & {
	notation?: "standard" | "scientific" | "engineering" | "compact";
	compactDisplay?: "short" | "long";
	currencySign?: "standard" | "accounting";
	unitDisplay?: "short" | "narrow" | "long";
	signDisplay?: "auto" | "always" | "exceptZero" | "negative" | "never";
	useGrouping?: boolean | "auto" | "always" | "min2";
	roundingMode?: string;
	roundingIncrement?: number;
	roundingPriority?: string;
	trailingZeroDisplay?: string;
	numberingSystem?: string;
};

type Rule = (value: unknown) => boolean;
/** Only marked options are forwarded to Intl; the rest belong to the wrapper. */
type OptionRule = readonly [validate: Rule, forwardToIntl?: true];
const string: Rule = value => typeof value === "string";
const integer: Rule = value => typeof value === "number" && Number.isSafeInteger(value);
const oneOf = (...values: readonly unknown[]): Rule => value => values.includes(value);
export const MAX_COMPACT_EXPONENT = 100;

const COMMON = {
	locale: [string], numberingSystem: [string, true],
	useGrouping: [oneOf(true, false, "auto", "always", "min2"), true],
	minimumIntegerDigits: [integer, true],
	minimumFractionDigits: [integer, true], maximumFractionDigits: [integer, true],
	minimumSignificantDigits: [integer, true], maximumSignificantDigits: [integer, true],
	roundingMode: [isRoundingMode, true], roundingIncrement: [integer, true],
	roundingPriority: [oneOf("auto", "morePrecision", "lessPrecision"), true],
	trailingZeroDisplay: [oneOf("auto", "stripIfInteger"), true],
	signDisplay: [oneOf("auto", "always", "exceptZero", "negative", "never"), true],
	negativeDisplay: [oneOf("sign", "parentheses")],
	groupSeparator: [string], decimalSeparator: [string],
	zeroDisplay: [string], nanDisplay: [string], infinityDisplay: [string],
} satisfies Record<keyof NumericDisplayOptions, OptionRule>;

const NOTATION = {
	notation: [oneOf("standard", "scientific", "engineering", "compact"), true],
	compactDisplay: [oneOf("short", "long"), true],
	compactExponent: [value => integer(value) && (value as number) >= 1 && (value as number) <= MAX_COMPACT_EXPONENT],
} satisfies Record<string, OptionRule>;

type DomainRules = { [Kind in NumericFormatSpec["kind"]]: {
	defaults: ModernNumberFormatOptions;
	rules: Record<Exclude<keyof Extract<NumericFormatSpec, { kind: Kind }>, keyof NumericDisplayOptions | "kind">, OptionRule>;
} };

const DOMAIN = {
	number: {
		defaults: {
			style: "decimal"
		},
		rules: NOTATION
	},
	currency: {
		defaults: {
			style: "currency"
		},
		rules: {
			...NOTATION, currency: [string, true], currencySymbol: [string],
			currencyDisplay: [oneOf("code", "symbol", "narrowSymbol", "name"), true],
			currencySign: [oneOf("standard", "accounting"), true],
		},
	},
	unit: {
		defaults: {
			style: "unit"
		},
		rules: {
			...NOTATION,
			unit: [string, true],
			unitSymbol: [string],
			unitDisplay: [oneOf("short", "long", "narrow"), true]
		},
	},
	percentage: {
		defaults: {
			style: "percent"
		},
		rules: {
			percentageScale: [integer],
			percentageSymbol: [string]
		}
	},
	ordinal: {
		defaults: {
			style: "decimal",
			maximumFractionDigits: 0
		},
		rules: {
			ordinalFallback: [oneOf("error", "number")],
			ordinalPatterns: [value => value !== null && typeof value === "object" && !Array.isArray(value)],
		},
	},
	bytes: {
		defaults: { style: "decimal", maximumFractionDigits: 1 },
		rules: {
			byteBase: [oneOf(1000, 1024)],
			byteExponent: [value => integer(value) && (value as number) >= 0 && (value as number) <= 8],
		},
	},
} satisfies DomainRules;

const RULES: Record<string, Record<string, OptionRule>> = Object.fromEntries(Object.entries(DOMAIN).map(([kind, domain]) =>
	[kind, { ...COMMON, ...domain.rules, kind: [oneOf(kind)] }],
));
const RULE_ENTRIES = Object.fromEntries(Object.entries(RULES).map(([kind, rules]) => [kind, Object.entries(rules)]));
const INTL_NAMES = Object.fromEntries(Object.entries(RULE_ENTRIES).map(([kind, entries]) =>
	[kind, entries.filter(([, [, forward]]) => forward).map(([name]) => name)],
));

/** Materialize supported options, including inherited/non-enumerable fields and patterns. */
export function numericSpecOptions<Spec extends NumericFormatSpec>(spec: Spec): Spec
{
	return captureOptions(spec, false);
}

function captureOptions<Spec extends NumericFormatSpec>(spec: Spec, validate: boolean): Spec
{
	const kind = spec.kind;
	const rules = RULES[kind];

	if (validate)
	{
		for (const key of Reflect.ownKeys(spec))
		{
			if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(rules, key))
			{
				throw new RangeError(`Unknown ${kind} format option: ${String(key)}`);
			}
		}
	}

	const options: Record<string, unknown> = {};

	for (const [key, [rule]] of RULE_ENTRIES[kind])
	{
		const value = key === "kind" ? kind : (spec as unknown as Record<string, unknown>)[key];
		if (validate && value !== undefined && !rule(value))
		{
			throw new RangeError(`Invalid ${kind} format option: ${key}`);
		}

		if (value !== undefined)
		{
			options[key] = value;
		}
	}

	if (kind === "ordinal" && options.ordinalPatterns !== undefined)
	{
		const patterns = options.ordinalPatterns as Partial<Record<Intl.LDMLPluralRule, string>>;

		// Reject unknown nested keys before copying only supported pattern values.
		if (validate)
		{
			for (const category of Reflect.ownKeys(patterns))
			{
				if (typeof category !== "string" || !(PLURAL_CATEGORIES as readonly string[]).includes(category))
				{
					throw new RangeError(`Invalid ordinal pattern for '${String(category)}'`);
				}
			}
		}

		options.ordinalPatterns = Object.fromEntries(PLURAL_CATEGORIES.map(category => [category, patterns[category]]));
	}

	return options as unknown as Spec;
}

/** Capture caller values once and validate the owned options; Intl owns precision ranges. */
export function normalizeNumericSpec(input: NumericFormatSpec): NumericFormatSpec
{
	const spec = captureOptions(input, true);
	if (spec.locale !== undefined)
	{
		Intl.getCanonicalLocales(spec.locale);
	}

	if (spec.kind === "currency" && spec.currency === undefined)
	{
		throw new TypeError("Currency format requires currency");
	}

	if (spec.kind === "unit" && spec.unit === undefined)
	{
		throw new TypeError("Unit format requires unit");
	}

	if (spec.kind === "ordinal" && spec.ordinalPatterns !== undefined)
	{
		if (typeof spec.ordinalPatterns.other !== "string")
		{
			throw new RangeError("Ordinal patterns require an other pattern");
		}

		for (const category of PLURAL_CATEGORIES)
		{
			const pattern = spec.ordinalPatterns[category];

			if (pattern !== undefined && (typeof pattern !== "string" || pattern.split("{number}").length !== 2))
			{
				throw new RangeError(`Invalid ordinal pattern for '${category}'`);
			}
		}
	}
	if ((spec.kind === "number" || spec.kind === "currency" || spec.kind === "unit") &&
		spec.compactExponent !== undefined && spec.notation !== undefined && spec.notation !== "compact")
	{
		throw new RangeError("compactExponent requires compact notation when notation is specified");
	}

	return isImmutableSnapshot(input) ? input : spec;
}

/** Map validated options using the same descriptors that govern capture and validation. */
export function numberFormatOptions(spec: NumericFormatSpec): ModernNumberFormatOptions
{
	const options: ModernNumberFormatOptions = { ...DOMAIN[spec.kind].defaults };

	for (const name of INTL_NAMES[spec.kind])
	{
		const value = (spec as unknown as Record<string, unknown>)[name];
		if (value !== undefined) (options as Record<string, unknown>)[name] = value;
	}

	if (spec.kind === "currency")
	{
		options.currency = options.currency!.toUpperCase();
	}

	if ((spec.kind === "number" || spec.kind === "currency" || spec.kind === "unit") &&
		spec.compactExponent !== undefined)
	{
		options.notation = "standard";
	}

	return options;
}
