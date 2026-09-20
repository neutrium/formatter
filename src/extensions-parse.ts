/**
 * Parser registries, built-in parsers, and types for codec authors.
 * Use `@neutrium/formatter/parse` for ordinary parsing and
 * `@neutrium/formatter/extensions` for shared codec types and formatting registries.
 * @module
 */
export { Parser } from "./core/Parser.js";
export type { ParseCodec, ParserOptions, ParserSpec, ParsedValue } from "./core/Parser.js";
export type { BuiltInParsers } from "./create-parser.js";
export { numberParser, currencyParser, percentageParser, unitParser, ordinalParser, bytesParser } from "./numeric/parse-codecs.js";
export { durationParser } from "./duration/parse-codec.js";
