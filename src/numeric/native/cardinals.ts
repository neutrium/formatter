import { LruCache } from "../../core/cache.js";
import { CARDINAL_DATA } from "./cardinal-data.js";

type Operand = "n" | "i" | "v" | "w" | "f" | "t" | "e" | "c";
type Operands = Record<Operand, bigint> & { fractional: boolean };
type Relation = (operands: Operands) => boolean;
type Selector = (displayed: string) => Intl.LDMLPluralRule;
const SELECTORS = new LruCache<string, Selector>(64);

/** Decode the already-rounded absolute decimal, preserving visible trailing zeros. */
function operands(displayed: string): Operands
{
	const [integer, fraction = ""] = displayed.split(".");
	const trimmed = fraction.replace(/0+$/, "");
	const i = BigInt(integer);

	return {
		n: i,
		i: i,
		v: BigInt(fraction.length),
		w: BigInt(trimmed.length),
		f: BigInt(fraction || "0"),
		t: BigInt(trimmed || "0"),
		e: 0n,
		c: 0n,
		fractional: trimmed.length !== 0
	};
}

function relation(source: string): Relation
{
	const match = /^([nivwftec])(?: % (\d+))? (!?=) (.+)$/.exec(source)!;
	const operand = match[1] as Operand;
	const modulo = match[2] ? BigInt(match[2]) : undefined;
	const negated = match[3] === "!=";
	const ranges = match[4].split(",").map(range => {
		const [start, end = start] = range.split("..");
		return [BigInt(start), BigInt(end)] as const;
	});

	return values => {
		const value = modulo === undefined ? values[operand] : values[operand] % modulo;
		// CLDR '=' is integer membership, including for n % modulus. A nonzero
		// fractional remainder cannot be in an integer range; '!=' negates that test.
		const member = !(operand === "n" && values.fractional) &&
			ranges.some(([start, end]) => value >= start && value <= end);

		return negated ? !member : member;
	};
}

/** Exact cardinal classification of rendered coefficient text; no rounding or Number coercion. */
export function cardinalSelector(locale: string): Selector
{
	const cached = SELECTORS.get(locale);

	if (cached)
	{
		return cached;
	}

	// The renderer supplies its negotiated NumberFormat locale. Keep rule
	// evaluation independent of Intl.PluralRules' different locale fallback.
	let resolved = new Intl.Locale(locale).baseName;
	let rules: (typeof CARDINAL_DATA)[number][1] = [];

	while (resolved)
	{
		const entry = CARDINAL_DATA.find(([locales]) => locales.split(" ").includes(resolved));

		if (entry)
		{
			rules = entry[1];
			break;
		}

		resolved = resolved.includes("-") ? resolved.slice(0, resolved.lastIndexOf("-")) : "";
	}

	const categories = rules.map(([category, condition]) => ({
		category,
		alternatives: condition.split(" or ").map(term => term.split(" and ").map(relation))
	}));

	return SELECTORS.set(locale, displayed => {
		const value = operands(displayed);
		return categories.find(({ alternatives }) => alternatives.some(terms => terms.every(test => test(value))))?.category ?? "other";
	});
}
