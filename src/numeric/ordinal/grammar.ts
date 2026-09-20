import type { NumericParseGrammar } from "../shared/parse-grammar.js";

export const ordinalGrammar: NumericParseGrammar = {
	*probes(spec, probe)
	{
		for (let value = 0; value <= 30; value++)
		{
			yield probe(String(value), spec);
			yield probe(String(-value), spec);
		}
	},
	// Ordinal patterns can introduce meaningful leading or trailing whitespace.
	canTrim: () => false,
};
