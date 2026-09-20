import { createFormatter } from "@neutrium/formatter";
import { numberCodec } from "@neutrium/formatter/extensions";
import type { CreateFormatterOptions, NumberFormatSpec, CurrencyFormatSpec, UnitFormatSpec, PercentageFormatSpec } from "@neutrium/formatter";
import type { FormatterOptions } from "@neutrium/formatter/extensions";
import { createParser } from "@neutrium/formatter/parse";
import { numberParser, type ParserOptions } from "@neutrium/formatter/extensions/parse";

const factoryOptions: CreateFormatterOptions = {};
factoryOptions.locale = "fr";
factoryOptions.context = { label: "amount" };
factoryOptions.codecs = [];
createFormatter(factoryOptions).format(1, { kind: "number" });

const parserOptions: ParserOptions = {};
parserOptions.locale = "fr";
parserOptions.context = { label: "amount" };
parserOptions.codecs = [];
const parsed: string = createParser(parserOptions).parse("1", { kind: "number" });

const registryOptions: FormatterOptions = { codecs: [numberCodec] };
// @ts-expect-error Low-level formatter options remain readonly.
registryOptions.locale = "fr";
// @ts-expect-error Low-level formatter options remain readonly.
registryOptions.codecs = [];
// @ts-expect-error Low-level formatter options remain readonly.
registryOptions.context = {};
// @ts-expect-error Factory options default to an empty additional-codec tuple.
factoryOptions.codecs = [numberCodec];
// @ts-expect-error Parser options default to an empty additional-codec tuple.
parserOptions.codecs = [numberParser];
// @ts-expect-error Parser codecs cannot be installed as formatting codecs.
type InvalidFormatterOptions = CreateFormatterOptions<readonly [typeof numberParser]>;
// @ts-expect-error Formatting codecs cannot be installed as parsing codecs.
type InvalidParserOptions = ParserOptions<readonly [typeof numberCodec]>;

const notation = { notation: "compact", compactDisplay: "long", compactExponent: 3 } as const;
const number: NumberFormatSpec = { kind: "number", ...notation };
const currency: CurrencyFormatSpec = { kind: "currency", currency: "USD", ...notation };
const unit: UnitFormatSpec = { kind: "unit", unit: "meter", ...notation };
// @ts-expect-error Shared notation options do not extend percentage specifications.
const percentage: PercentageFormatSpec = { kind: "percentage", notation: "compact" };
// @ts-expect-error Sharing notation options does not make currency optional.
const missingCurrency: CurrencyFormatSpec = { kind: "currency", ...notation };
// @ts-expect-error Sharing notation options does not make unit optional.
const missingUnit: UnitFormatSpec = { kind: "unit", ...notation };
