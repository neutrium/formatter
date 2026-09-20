import { createFormatter } from "@neutrium/formatter";
import { createParser, type CreateParserOptions } from "@neutrium/formatter/parse";
import { Formatter, numberCodec, type BuiltInCodecs } from "@neutrium/formatter/extensions";
import { Parser, numberParser, type BuiltInParsers } from "@neutrium/formatter/extensions/parse";

const format: Formatter<BuiltInCodecs> = createFormatter();
const options: CreateParserOptions = { locale: "de-DE" };
const parse: Parser<BuiltInParsers> = createParser(options);
const text: string = new Formatter({ codecs: [numberCodec] }).format(1, { kind: "number" });
const value: string = new Parser({ codecs: [numberParser] }).parse(text, { kind: "number" });
void [format, parse, value];

// @ts-expect-error Registry constructors belong to the authoring entry.
import { Formatter as RootFormatter } from "@neutrium/formatter";
// @ts-expect-error Individual codecs belong to the authoring entry.
import { numberCodec as RootCodec } from "@neutrium/formatter";
// @ts-expect-error Parser registries belong to the parsing authoring entry.
import { Parser as OrdinaryParser } from "@neutrium/formatter/parse";
// @ts-expect-error Individual parsers belong to the parsing authoring entry.
import { numberParser as OrdinaryCodec } from "@neutrium/formatter/parse";
// @ts-expect-error Authoring types are not ordinary parsing exports.
import type { ParseCodec } from "@neutrium/formatter/parse";
// @ts-expect-error Registry tuples are authoring-only types.
import type { BuiltInParsers as OrdinaryBuiltIns } from "@neutrium/formatter/parse";
// @ts-expect-error Parsing authoring remains opt-in even for formatting authors.
import { Parser as FormattingParser } from "@neutrium/formatter/extensions";
