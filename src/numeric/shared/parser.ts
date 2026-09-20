import type { Decimal } from "@neutrium/decimal/arithmetic";
import { LruCache } from "../../core/cache.js";
import { FormatContext } from "../../core/codec.js";
import { immutableSnapshot } from "../../core/immutable-snapshot.js";
import { FormatToken, renderTokens } from "../../core/tokens.js";
import { parseQuantity } from "./decimal-string.js";
import type { NumericParseGrammar, ParseProbe } from "./parse-grammar.js";
import { digitTokens } from "./digits.js";
import type { NumericEngine, NumericExecution } from "./engine.js";
import { createNumberFormat, formatIntlParts, localeFor, tokensFromIntlParts } from "./intl-format.js";
import { numericSpecOptions } from "./options.js";
import { NumericFormatSpec } from "../specs.js";

/** Shared scanner and incremental profiles, with grammar supplied by the selected domain. */
export function createNumericParserPreparation(engine: NumericEngine, grammar: NumericParseGrammar)
{
	function executionFor(spec: NumericFormatSpec, profile: ParseProfile): NumericExecution
	{
		return spec === profile.spec ? profile.scalar : engine.prepare(spec, profile.scalar.context);
	}

	const NUMERIC_TOKENS = new Set([
		"integer", "group", "decimal", "fraction", "exponentSeparator", "exponentSign", "exponentInteger",
	]);

	interface Pattern
	{
		readonly prefix: string;
		readonly suffix: string;
		readonly negative: boolean;
		readonly scale: number;
		/** Original minus rounded probe values, used only to verify rounded plural grammar. */
		readonly offsets: Decimal[];
	}

	interface SyntaxToken
	{
		readonly source: string;
		readonly output: string;
	}

	interface ParseProfile
	{
		readonly spec: NumericFormatSpec;
		readonly scalar: NumericExecution;
		readonly trimInput: boolean;
		readonly exactValues: Map<string, Decimal>;
		readonly patterns: Pattern[];
		readonly patternsByKey: Map<string, Pattern>;
		readonly specialValues: ReadonlyMap<string, Decimal>;
		syntax: readonly SyntaxToken[];
		syntaxValues?: Map<string, string>;
		probes?: Generator<ParseProbe>;
		pending?: ParseProbe;
		exhausted: boolean;
	}

	const PARSE_PROFILES = new WeakMap<FormatContext, LruCache<string, ParseProfile>>();

	function probe(value: string | Decimal, spec: NumericFormatSpec, profile: ParseProfile, scale: number | "infer" = 0): ParseProbe
	{
		const input = typeof value === "string" ? parseQuantity(value) : value;
		const displayed = executionFor(spec, profile).detailed(input);

		return {
			input,
			rounded: displayed.quantity,
			tokens: displayed.parts,
			scale: scale === "infer" ? displayed.scale?.exponent ?? 0 : scale
		};
	}

	function patternsFor(profile: ParseProfile): Generator<ParseProbe>
	{
		return grammar.probes(profile.spec, (value, options, scale) => probe(value, options, profile, scale));
	}

	function patternFromProbe(value: ParseProbe, spec: NumericFormatSpec): Pattern | null
	{
		const first = value.tokens.findIndex((token) => NUMERIC_TOKENS.has(token.type));

		if (first < 0)
		{
			return null;
		}

		let last = first;

		for (let index = first; index < value.tokens.length; index += 1)
		{
			if (NUMERIC_TOKENS.has(value.tokens[index].type))
			{
				last = index;
			}
		}

		const offset = grammar.offset?.(value, spec);

		return {
			prefix: renderTokens(value.tokens.slice(0, first)),
			suffix: renderTokens(value.tokens.slice(last + 1)),
			negative: value.rounded.isNeg(),
			scale: value.scale,
			offsets: offset === undefined ? [] : [offset],
		};
	}

	function syntaxTokens(spec: NumericFormatSpec, context: FormatContext): Map<string, string>
	{
		const values = new Map<string, string>();

		for (const token of digitTokens(localeFor(spec, context), spec.numberingSystem))
		{
			values.set(token.source, token.output);
		}

		const syntaxSpec = {
			kind: "number" as const,
			locale: spec.locale,
			numberingSystem: spec.numberingSystem,
			groupSeparator: spec.groupSeparator,
			decimalSeparator: spec.decimalSeparator,
			useGrouping: true,
			maximumFractionDigits: 2,
		};

		const diagnosticProbes = [
			{ tokens: tokensFromIntlParts(formatIntlParts(createNumberFormat(syntaxSpec, context), parseQuantity("1234567.89"), syntaxSpec)) },
			{
				tokens: tokensFromIntlParts(formatIntlParts(createNumberFormat({ ...syntaxSpec, notation: "scientific" }, context), parseQuantity("1234"), syntaxSpec)),
			},
		];

		for (const value of diagnosticProbes)
		{
			addSyntaxTokens(values, value.tokens);
		}

		values.set("-", "-");
		values.set("+", "+");
		values.set("e", "e");
		values.set("E", "e");

		return values;
	}
	/** Extend syntax only when a newly discovered presentation contributes a token. */
	function addSyntaxTokens(values: Map<string, string>, tokens: readonly FormatToken[]): boolean
	{
		const first = tokens.findIndex(token => NUMERIC_TOKENS.has(token.type));
		let last = first;

		for (let index = first + 1; index < tokens.length; index++)
		{
			if (NUMERIC_TOKENS.has(tokens[index].type))
			{
				last = index;
			}
		}

		let changed = false;

		for (let index = 0; index < tokens.length; index++)
		{
			const token = tokens[index];
			const output = token.type === "group" ? "" : token.type === "decimal" ? "." :
				token.type === "exponentSeparator" ? "e" : token.type === "exponentSign" ? "-" :
					token.type === "literal" && index > first && index < last ? "" : undefined;

			if (output !== undefined && token.value.length > 0 && values.get(token.value) !== output)
			{
				values.set(token.value, output);
				changed = true;
			}
		}

		return changed;
	}

	function scanCore(source: string, syntax: readonly SyntaxToken[]): Decimal
	{
		let canonical = "";
		let index = 0;

		while (index < source.length)
		{
			const token = syntax.find((candidate) => source.startsWith(candidate.source, index));

			if (!token)
			{
				throw new TypeError(`Invalid localized number: ${source}`);
			}

			canonical += token.output;
			index += token.source.length;
		}

		return parseQuantity(canonical);
	}

	function specialValues(scalar: NumericExecution): ReadonlyMap<string, Decimal>
	{
		const values = new Map<string, Decimal>();

		for (const source of ["NaN", "Infinity", "-Infinity", "0", "-0"])
		{
			const quantity = parseQuantity(source);
			const formatted = renderTokens(scalar.quantity(quantity));

			if (!values.has(formatted))
			{
				values.set(formatted, quantity);
			}
		}

		return values;
	}

	function createParseProfile(scalar: NumericExecution): ParseProfile
	{
		return {
			scalar,
			spec: scalar.spec,
			trimInput: canTrimInput(scalar.spec),
			exactValues: new Map(),
			patterns: [],
			patternsByKey: new Map(),
			specialValues: specialValues(scalar),
			syntax: [],
			exhausted: false
		};
	}

	/** Native numeric presentations have no boundary whitespace. Keep the exhaustive
	 * exact-first path for overrides and wrappers that can introduce meaningful edges. */
	function canTrimInput(spec: NumericFormatSpec): boolean
	{
		return grammar.canTrim(spec) && spec.nanDisplay === undefined && spec.infinityDisplay === undefined &&
			spec.groupSeparator === undefined && spec.decimalSeparator === undefined;
	}

	/** Retain only discoveries needed so far; cached profiles can resume for later inputs. */
	function extendParseProfile(profile: ParseProfile): boolean
	{
		if (profile.exhausted)
		{
			return false;
		}

		let next: IteratorResult<ParseProbe>;

		try
		{
			next = profile.pending ? { value: profile.pending, done: false } : (profile.probes ??= patternsFor(profile)).next();
		}
		catch (error)
		{
			// Throwing closes a generator. Retry from its immutable specification after
			// a transient Intl failure, retaining successful, deduplicated discoveries.
			profile.probes = undefined;
			throw error;
		}

		if (next.done)
			{
			profile.exhausted = true;
			return false;
		}

		const value = next.value;
		profile.pending = value;
		profile.syntaxValues ??= syntaxTokens(profile.spec, profile.scalar.context);

		if (addSyntaxTokens(profile.syntaxValues, value.tokens) || profile.syntax.length === 0)
		{
			profile.syntax = [...profile.syntaxValues].map(([source, output]) => ({ source, output }))
				.sort((left, right) => right.source.length - left.source.length);
		}

		const rendered = renderTokens(value.tokens);
		if (!profile.exactValues.has(rendered))
		{
			profile.exactValues.set(rendered, value.rounded);
		}

		const pattern = patternFromProbe(value, profile.spec);

		if (pattern)
		{
			const key = `${pattern.prefix}\u0000${pattern.suffix}\u0000${pattern.negative}\u0000${pattern.scale}`;
			const existing = profile.patternsByKey.get(key);

			if (!existing)
			{
				profile.patternsByKey.set(key, pattern);
				profile.patterns.push(pattern);
				profile.patterns.sort((left, right) => right.prefix.length + right.suffix.length - left.prefix.length - left.suffix.length);
			}
			else if (pattern.offsets.length > 0 && !existing.offsets.some(offset => offset.eq(pattern.offsets[0])))
			{
				existing.offsets.push(pattern.offsets[0]);
			}
		}

		profile.pending = undefined;

		return true;
	}

	function parseProfile(scalar: NumericExecution): ParseProfile
	{
		const { spec, context } = scalar;
		let profiles = PARSE_PROFILES.get(context);

		if (!profiles)
		{
			profiles = new LruCache(128);
			PARSE_PROFILES.set(context, profiles);
		}

		// Read the owned snapshot in descriptor order, including non-enumerable
		// options and nested ordinal patterns. Never revisit caller accessors.
		// Whole-output zero aliases are not part of the numeric grammar.
		const { zeroDisplay, ...options } = numericSpecOptions(spec);
		const key = JSON.stringify(options);
		let profile = profiles.get(key);

		if (!profile)
		{
			profile = createParseProfile(zeroDisplay === undefined ? scalar : engine.prepare(immutableSnapshot(options), context));
			profiles.set(key, profile);
		}

		return profile;
	}

	function parseNumericQuantity(input: string, profile: ParseProfile): Decimal
	{
		const { spec } = profile;
		// If this presentation cannot emit edge whitespace, trimming cannot hide an
		// exact match. Use the same incremental discovery as an unpadded input.
		const source = profile.trimInput ? input.trim() : input;
		// Exact output wins, including meaningful whitespace in overrides. Only then
		// tolerate surrounding whitespace, consistently on both input and presentation.
		let result = matchNumericValue(source, profile, false);

		if (result !== undefined)
		{
			return result;
		}

		const exactAttempts = new Map<Pattern, number>();
		let syntax = profile.syntax;

		while (extendParseProfile(profile))
		{
			if (syntax !== profile.syntax)
			{
				exactAttempts.clear();
				syntax = profile.syntax;
			}

			result = matchNumericValue(source, profile, false, exactAttempts);

			if (result !== undefined)
			{
				return result;
			}
		}
		// A tolerant match cannot win while an undiscovered exact match may exist.
		// Otherwise an override such as " 1K " can shadow "1K" only on a cold cache.
		result = matchNumericValue(input.trim(), profile, true);

		if (result !== undefined)
		{
			return result;
		}

		throw new TypeError(`Invalid formatted ${spec.kind}: ${input}`);
	}

	function profileValue<Value>(values: ReadonlyMap<string, Value>, source: string, trimWhitespace: boolean): Value | undefined
	{
		if (!trimWhitespace)
		{
			return values.get(source);
		}

		for (const [text, value] of values)
		{
			if (text.trim() === source)
			{
				return value;
			}
		}

		return undefined;
	}

	function matchNumericValue(source: string, profile: ParseProfile, trimWhitespace: boolean, attempts?: Map<Pattern, number>): Decimal | undefined
	{
		const { spec } = profile;
		const special = profileValue(profile.specialValues, source, trimWhitespace);

		if (special !== undefined)
		{
			return special;
		}

		const exact = profileValue(profile.exactValues, source, trimWhitespace);

		if (exact !== undefined)
		{
			return exact;
		}

		for (const pattern of profile.patterns)
		{
			// Growing the profile must not repeatedly revalidate unchanged patterns.
			// New syntax or a new rounding witness makes a failed pattern eligible again.
			if (attempts?.get(pattern) === pattern.offsets.length)
			{
				continue;
			}

			attempts?.set(pattern, pattern.offsets.length);
			const prefix = trimWhitespace ? pattern.prefix.trimStart() : pattern.prefix;
			const suffix = trimWhitespace ? pattern.suffix.trimEnd() : pattern.suffix;

			if (!source.startsWith(prefix) || !source.endsWith(suffix))
			{
				continue;
			}

			const end = suffix.length === 0 ? source.length : -suffix.length;
			const core = source.slice(prefix.length, end);

			if (!core)
			{
				continue;
			}

			try
			{
				let displayed = scanCore(core, profile.syntax);

				if (pattern.negative && !displayed.isNeg())
				{
					displayed = displayed.neg();
				}

				const { quantity: result, spec: validationSpec } = grammar.restore?.(displayed, pattern.scale, spec) ?? {
					quantity: pattern.scale === 0 ? displayed : displayed.shift(pattern.scale), spec,
				};
				const formatted = renderTokens(executionFor(validationSpec, profile).quantity(result));

				if ((trimWhitespace ? formatted.trim() : formatted) === source)
				{
					return result;
				}

				if (pattern.offsets.length > 0 && grammar.matchesRounded?.(source, result, pattern.offsets, trimWhitespace, value => probe(value, validationSpec, profile)))
				{
					return result;
				}
			}
			catch
			{
				// Try the next locale-derived presentation pattern.
			}
		}
		return undefined;
	}

	return (spec: NumericFormatSpec, context: FormatContext) => {
		const scalar = engine.prepare(spec, context);
		const { zeroDisplay } = scalar.spec;
		let profile: ParseProfile | undefined;

		return {
			parse(input: string): string
			{
				if (zeroDisplay !== undefined && (input === zeroDisplay || input.trim() === zeroDisplay.trim()))
				{
					return "0";
				}

				return parseNumericQuantity(input, profile ??= parseProfile(scalar)).toFixed();
			},
			resolve: () => ({ ...scalar.resolution, rangeImplementation: "unsupported" as const }),
		};
	};
}
