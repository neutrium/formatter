/**
 * Convert localized text back to exact values with `@neutrium/formatter/parse`.
 *
 * Start with {@link parse!parser} for `en-US`, or {@link parse!createParser} to set a default
 * locale. Use {@link extensions-parse!Parser.parse} for one input and {@link extensions-parse!Parser.compile} for
 * repeated parsing. Built-in parsers return canonical strings. Localized duration
 * text cannot be parsed; elapsed durations require `presentation: "elapsed"`.
 * Formatting is available separately from `@neutrium/formatter`.
 * @module
 */
import { createParser, type BuiltInParsers } from "./create-parser.js";
import type { Parser } from "./core/Parser.js";
export { createParser } from "./create-parser.js";
export type { CreateParserOptions } from "./create-parser.js";

/**
 * Shared parser containing all built-in parsing domains, with an `en-US` default locale.
 * A specification's `locale` overrides that default for an operation. Use
 * {@link parse!createParser} for independent defaults or additional parsers.
 *
 * @example Recover exact numeric and elapsed-duration values
 * ```ts
 * import { parser } from "@neutrium/formatter/parse";
 *
 * parser.parse("$1,234.50", { kind: "currency", currency: "USD" }); // "1234.5"
 * parser.parse("1:01:01", { kind: "duration", presentation: "elapsed" }); // "3661"
 * ```
 */
export const parser: Parser<BuiltInParsers> = createParser();
export type { CompiledParser } from "./core/Parser.js";
export { UnsupportedParseError, UnknownFormatError, DuplicateFormatError } from "./core/errors.js";
