import type { ParseCodec } from "../core/Parser.js";
import type { ElapsedDurationFormatSpec } from "./spec.js";
import { prepareDurationParser } from "./parser.js";
import { registerParserPreparation } from "../core/parser-preparation.js";

function createDurationParser(): Readonly<ParseCodec<"duration", ElapsedDurationFormatSpec, string>>
{
	const codec: ParseCodec<"duration", ElapsedDurationFormatSpec, string> = {
		kind: "duration",
		parse: (input, spec, context) => prepareDurationParser(spec, context).parse(input),
		resolve: (spec, context) => prepareDurationParser(spec, context).resolve(),
	};
	registerParserPreparation(codec, prepareDurationParser);

	return codec;
}

/**
 * Built-in elapsed-duration parser, already installed by {@link parse!createParser}.
 * Returns a canonical string in the specification's `inputUnit` (seconds by
 * default). Localized duration text cannot be parsed.
 *
 * @example
 * ```ts
 * import { parser } from "@neutrium/formatter/parse";
 * parser.parse("1:01:01", { kind: "duration", presentation: "elapsed" }); // "3661"
 * ```
 */
export const durationParser = /* @__PURE__ */ createDurationParser();
