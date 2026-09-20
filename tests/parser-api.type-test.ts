import { formatter, type NumberFormatSpec } from "@neutrium/formatter";
import { parser, createParser, type CompiledParser } from "@neutrium/formatter/parse";
import { Parser, numberParser, type ParseCodec, type ParsedValue, type ParserSpec } from "@neutrium/formatter/extensions/parse";

const spec = { kind: "number", maximumFractionDigits: 2 } satisfies NumberFormatSpec;
const exact: string = parser.parse("1.23", spec);
const compiled: CompiledParser<string, typeof spec> = parser.compile(spec);
const result: string = compiled.parse("1.23");
// @ts-expect-error Parsing requires an explicit specification.
parser.parse("1.23");
// @ts-expect-error Parsing is not available from formatting instances.
formatter.parse("1.23", spec);
// @ts-expect-error Compiled formatters also have no parsing method.
formatter.compile(spec).parse("1.23");
// @ts-expect-error Formatting is not available from parsing instances.
parser.format(1.23, spec);
// @ts-expect-error Parsing requires formatted text.
parser.parse(1.23, spec);
// @ts-expect-error Currency codes remain required.
parser.parse("$1.00", { kind: "currency" });
// @ts-expect-error Unknown and wrong-domain options are rejected.
parser.parse("1", { kind: "number", currency: "USD" });
// @ts-expect-error Unknown options are rejected on compile too.
parser.compile({ kind: "number", maximumFractonDigits: 2 });
// @ts-expect-error Localized duration presentation is never parseable.
parser.compile({ kind: "duration", presentation: "localized" });
// @ts-expect-error Bound specs are readonly.
compiled.spec.maximumFractionDigits = 3;

interface PointSpec { kind: "point"; nested: { prefix: string } }
const pointParser = {
	kind: "point",
	parse(input, spec) { return { x: Number(input.slice(spec.nested.prefix.length)) }; },
} satisfies ParseCodec<"point", PointSpec, { x: number }>;
const custom = createParser({ codecs: [pointParser], locale: "de-DE" });
const point = custom.compile({ kind: "point", nested: { prefix: "@" } });
const x: number = point.parse("@1").x;
// @ts-expect-error Deeply readonly snapshots.
point.spec.nested.prefix = "!";
custom.parse("1,2", { kind: "number" });
const isolated = new Parser({ codecs: [pointParser] });
// @ts-expect-error Explicit registries include only their installed parsers.
isolated.parse("1", { kind: "number" });
const extended = isolated.withCodec(numberParser);
extended.parse("1", { kind: "number" });
const inferredSpec: ParserSpec<readonly [typeof pointParser]> = { kind: "point", nested: { prefix: "@" } };
const inferredValue: ParsedValue<readonly [typeof pointParser], PointSpec> = { x: 1 };
// @ts-expect-error Explicit generic parameters cannot invent installed codecs.
new Parser<readonly [typeof pointParser]>();
// @ts-expect-error Factory generic parameters cannot invent installed codecs.
createParser<readonly [typeof pointParser]>({ locale: "de-DE" });

// A parser that needs no options still requires its registered kind.
const label = new Parser({ codecs: [{ kind: "label", parse: (text: string) => text }] });
const text: string = label.parse("hello", { kind: "label" });
void [exact, result, x, inferredSpec, inferredValue, text];
