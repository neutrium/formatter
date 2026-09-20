import type { Decimal } from "@neutrium/decimal/arithmetic";
import type { FormatToken } from "../../core/tokens.js";
import type { NumericFormatSpec } from "../specs.js";

export interface ParseProbe
{
	readonly input: Decimal;
	readonly rounded: Decimal;
	readonly tokens: readonly FormatToken[];
	/** Decimal exponent by default; domain grammars may interpret their own scale. */
	readonly scale: number;
}

type ProbeNumeric = (value: string | Decimal, spec: NumericFormatSpec, scale?: number | "infer") => ParseProbe;

/** Domain-specific discovery and inverse rules; scanning and profile caches stay shared. */
export interface NumericParseGrammar
{
	probes(spec: NumericFormatSpec, probe: ProbeNumeric): Generator<ParseProbe>;
	canTrim(spec: NumericFormatSpec): boolean;
	restore?(quantity: Decimal, scale: number, spec: NumericFormatSpec): { quantity: Decimal; spec: NumericFormatSpec };
	offset?(probe: ParseProbe, spec: NumericFormatSpec): Decimal | undefined;
	matchesRounded?(
		source: string,
		rounded: Decimal,
		offsets: readonly Decimal[],
		trim: boolean,
		probe: (value: Decimal) => ParseProbe
	): boolean;
}
