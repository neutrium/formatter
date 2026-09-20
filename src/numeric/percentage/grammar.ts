import { positivePowerOfTen } from "../shared/decimal-string.js";
import type { NumericParseGrammar } from "../shared/parse-grammar.js";
import type { PercentageFormatSpec } from "./spec.js";

export const percentageGrammar: NumericParseGrammar = {
	*probes(spec, probe)
	{
		const scale = positivePowerOfTen((spec as PercentageFormatSpec).percentageScale ?? 100);

		for (const value of ["0.00125", "0.125", "1", "2", "-0.125", "-2"])
		{
			yield probe(value, spec, -scale);
		}
	},
	canTrim: spec => (spec as PercentageFormatSpec).percentageSymbol === undefined,
};
