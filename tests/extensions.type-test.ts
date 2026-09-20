import { parser } from "@neutrium/formatter/parse";
import { formatter, type CompiledFormatter, type NumericValue } from "@neutrium/formatter";
import { Formatter } from "@neutrium/formatter/extensions";
import type {
	FormatCodec, FormatSpecBase, FormatContext, CodecFormatResolution,
	ContractCodec, FormatContract, FormatterSpec, FormatValue, RoundedValue,
	CompiledFormat, BuiltInCodecs, FormatterOptions,
} from "@neutrium/formatter/extensions";

interface LabelSpec extends FormatSpecBase { kind: "label"; prefix?: string }
type LabelContracts = readonly [FormatContract<LabelSpec, string, string, false>];
const codec = {
	kind: "label",
	format(value: string, spec: LabelSpec, context: FormatContext) {
		return [{ type: "literal", value: (spec.prefix ?? context.locale) + value }];
	},
	formatDetailed(input: string) { return { parts: [], roundedValue: input }; },
	resolve(): CodecFormatResolution { return { rangeImplementation: "unsupported" }; },
} satisfies FormatCodec<"label", string, LabelSpec, string>;
const contracted: typeof codec & ContractCodec<LabelContracts> = codec;
const options: FormatterOptions<readonly [typeof contracted]> = { codecs: [contracted] };
const registry = new Formatter({ ...options, codecs: [contracted] });
const label: CompiledFormat<readonly [typeof contracted], LabelSpec> = registry.compile({ kind: "label" });
const text: string = label.format("hello");
// @ts-expect-error Contract excludes ranges.
label.formatRange("a", "b");
const spec: FormatterSpec<BuiltInCodecs> = { kind: "number" };
const value: FormatValue<BuiltInCodecs, typeof spec> = 12;
const parsed: RoundedValue<BuiltInCodecs, typeof spec> = formatter.formatDetailed(12, spec).roundedValue!;
const rendering: CompiledFormatter<NumericValue> = formatter.compile(spec);
rendering.format(value);
const money = formatter.compile({ kind: "currency", currency: "USD" });
const sameCapabilities: typeof money = money;
parser.compile(money.spec).parse("$12.00");
sameCapabilities.formatRange(1, 2);
void [text, parsed];

// No root aliases: extension imports have one documented home.
// @ts-expect-error Codec authoring types live in /extensions.
import type { FormatCodec as RootCodec } from "@neutrium/formatter";
// @ts-expect-error Contract machinery lives in /extensions.
import type { ContractCodec as RootContract } from "@neutrium/formatter";
// @ts-expect-error Registry-derived compiled type lives in /extensions.
import type { CompiledFormat as RootCompiled } from "@neutrium/formatter";
// @ts-expect-error Codec tuple type lives in /extensions.
import type { BuiltInCodecs as RootBuiltIns } from "@neutrium/formatter";
// @ts-expect-error Low-level constructor options live in /extensions.
import type { FormatterOptions as RootOptions } from "@neutrium/formatter";
// @ts-expect-error Capability variants are implementation details.
import type { ParseableCompiledFormatter } from "@neutrium/formatter";
// @ts-expect-error Capability variants are implementation details.
import type { RangeCompiledFormatter } from "@neutrium/formatter";
// @ts-expect-error Capability variants are implementation details.
import type { DynamicCompiledFormatter } from "@neutrium/formatter";
// @ts-expect-error Redundant combined variant is removed.
import type { CompleteCompiledFormatter } from "@neutrium/formatter";
// @ts-expect-error Type-erased codec is internal, not an extension API.
import type { AnyFormatCodec } from "@neutrium/formatter/extensions";
// @ts-expect-error Registry implementation helper is internal.
import type { CodecMap } from "@neutrium/formatter/extensions";
// @ts-expect-error /extensions does not re-expose internal compiled variants.
import type { DynamicCompiledFormatter as ExtensionDynamic } from "@neutrium/formatter/extensions";
