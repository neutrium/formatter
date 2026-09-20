import { parser, createParser } from "@neutrium/formatter/parse";
import { type ParseCodec } from "@neutrium/formatter/extensions/parse";
import {
	formatter, createFormatter,
	type CurrencyFormatSpec, type NumberFormatSpec, type PercentageFormatSpec,
} from "@neutrium/formatter";
import type { FormatCodec, FormatSpecBase } from "@neutrium/formatter/extensions";

const moneySpec = {
	kind: "currency", currency: "USD", maximumFractionDigits: 2,
} satisfies CurrencyFormatSpec;
const money = formatter.compile(moneySpec);
const formattedMoney: string[] = ["12.25", "20"].map(money.format);
const parsedMoney: string = parser.compile(money.spec).parse("$12.25");
const millions = { kind: "number", compactExponent: 6, maximumFractionDigits: 2 } satisfies NumberFormatSpec;
formatter.format(1234567, millions);
const basisPoints = {
	kind: "percentage", percentageScale: 10000, percentageSymbol: " bp", maximumFractionDigits: 0,
} satisfies PercentageFormatSpec;
parser.parse("125 bp", basisPoints);
const result = formatter.formatDetailed("1234.567", { kind: "number", maximumFractionDigits: 2 });
const text: string = result.text;
const roundedValue: string | undefined = result.roundedValue;
const tokenValue: string = result.parts[0].value;
const locale: string = result.resolution.locale;
void locale;

interface Point { x: number; y: number }
interface PointSpec extends FormatSpecBase { kind: "point"; separator?: string }
const pointCodec = {
	kind: "point",
	format(point, spec) {
		return [{ type: "literal", value: `${point.x}${spec.separator ?? ","}${point.y}` }];
	},
	parse(input, spec) {
		const fields = input.split(spec.separator ?? ",");
		if (fields.length !== 2 || fields.some(field => field.trim() === "" || !Number.isFinite(Number(field)))) {
			throw new TypeError("Expected two finite coordinates");
		}
		const [x, y] = fields.map(Number);
		return { x, y };
	},
} satisfies FormatCodec<"point", Point, PointSpec, Point> & ParseCodec<"point", PointSpec, Point>;
const custom = createFormatter({ codecs: [pointCodec] });
const point: Point = createParser({ codecs: [pointCodec] }).parse("10,20", { kind: "point" });
const compiledPoint: Point = createParser({ codecs: [pointCodec] }).compile(custom.compile({ kind: "point" }).spec).parse("10,20");
void [formattedMoney, parsedMoney, text, roundedValue, tokenValue, point, compiledPoint];
