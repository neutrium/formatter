import { createFormatter, formatter } from "@neutrium/formatter";
import { createParser, parser } from "@neutrium/formatter/parse";

const german = createFormatter({ locale: "de-DE" });
const compiled = german.compile({ kind: "number" });
const locale: string = compiled.spec.locale;
const undefinedLocale: string = german.compile({ kind: "number", locale: undefined }).spec.locale;
const seriesLocale: string = german.compileSeries([1000], { kind: "bytes" }).spec.locale;
const parserLocale: string = createParser({ locale: "fr" }).compile({ kind: "number" }).spec.locale;
parser.compile(compiled.spec).parse("1,234");
formatter.compile(compiled.spec).format(1);
// @ts-expect-error Bound locale is immutable.
compiled.spec.locale = "en-US";
