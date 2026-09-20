import type { Decimal } from "@neutrium/decimal/arithmetic";
import type { FormatScale } from "../../core/capabilities.js";
import { FormatContext } from "../../core/codec.js";
import { immutableSnapshot, isImmutableSnapshot } from "../../core/immutable-snapshot.js";
import { FormatToken } from "../../core/tokens.js";
import { NumericValue } from "../../types.js";
import { displayedCoefficient, displaysZero } from "./coefficient.js";
import { normalizeNumericRange, parseQuantity } from "./decimal-string.js";
import { createNumberFormat } from "./intl-format.js";
import { renderedNumericQuantity } from "./metadata.js";
import { normalizeNumericSpec, numberFormatOptions, numericSpecOptions } from "./options.js";
import { NumericFormatSpec } from "../specs.js";
import { resolveNumericFormat } from "./resolution.js";

export type CaptureParts = (parts: readonly Intl.NumberFormatPart[], zeroReplaced?: boolean) => void;

export interface NumericDomainExecution
{
	metadata?(quantity: Decimal, raw: readonly Intl.NumberFormatPart[], parts: readonly FormatToken[]):
	{
		quantity: Decimal;
		scale?: FormatScale;
	};
	render(quantity: Decimal, capture?: CaptureParts): readonly FormatToken[];
	string?(quantity: Decimal): string;
	intlQuantity?(quantity: Decimal): Decimal;
	automatic?: boolean;
	select?(values: Iterable<Decimal>): NumericFormatSpec;
}

export interface NumericDomain
{
	prepare(spec: NumericFormatSpec, context: FormatContext, formatter: Intl.NumberFormat): NumericDomainExecution;
}

export function createNumericEngine(definition: NumericDomain)
{
	const cached = new WeakMap<FormatContext, WeakMap<object, ReturnType<typeof build>>>();
	function prepare(spec: NumericFormatSpec, context: FormatContext)
	{
		if (isImmutableSnapshot(spec))
		{
			const found = cached.get(context)?.get(spec);
			if (found)
			{
				return found;
			}
		}
		const normalized = normalizeNumericSpec(spec);
		const effective = isImmutableSnapshot(normalized) ? normalized : immutableSnapshot(normalized);
		const options = numberFormatOptions(effective);
		const formatter = createNumberFormat(effective, context, { locale: effective.locale ?? context.locale, options });
		const execution = build(effective, context, formatter, options);

		if (isImmutableSnapshot(spec))
		{
			let bySpec = cached.get(context);

			if (!bySpec)
			{
				bySpec = new WeakMap();
				cached.set(context, bySpec);
			}

			bySpec.set(spec, execution);
		}

		return execution;
	}
	function build(spec: NumericFormatSpec, context: FormatContext, formatter: Intl.NumberFormat, options: ReturnType<typeof numberFormatOptions>)
	{
		const domain = definition.prepare(spec, context, formatter);
		const resolution = resolveNumericFormat(spec, formatter, options);
		const numericMetadata: NonNullable<NumericDomainExecution["metadata"]> = domain.metadata?.bind(domain) ??
			((quantity: Decimal, raw: readonly Intl.NumberFormatPart[], parts: readonly FormatToken[]) =>
				({ quantity: renderedNumericQuantity(quantity, spec, context, raw, parts) }));
		const zeroDisplay = spec.zeroDisplay;
		const stringRenderer = spec.groupSeparator === undefined && spec.decimalSeparator === undefined &&
			zeroDisplay === undefined && spec.nanDisplay === undefined && spec.infinityDisplay === undefined &&
			!(spec.kind === "currency" && spec.currencySymbol !== undefined) &&
			!(spec.kind === "unit" && spec.unitSymbol !== undefined) &&
			!(spec.kind === "percentage" && spec.percentageSymbol !== undefined)
			? domain.string?.bind(domain) : undefined;
		const shouldParenthesize: (quantity: Decimal) => boolean =
			spec.negativeDisplay !== "parentheses" || spec.signDisplay === "never" ? () => false :
			spec.signDisplay === "negative" || spec.signDisplay === "exceptZero"
				? quantity => quantity.isNeg() && !quantity.isZero()
				: quantity => quantity.isNeg();
		// Parentheses are a token wrapper; only accounting currency needs different Intl options.
		let parenthesized = spec.kind === "currency" && spec.currencySign === "accounting"
			? undefined : domain;

		function parenthesesVariant(): NumericDomainExecution
		{
			if (!parenthesized)
			{
				const options = { ...numericSpecOptions(spec), currencySign: "standard" as const, negativeDisplay: "sign" as const };
				parenthesized = definition.prepare(options, context, createNumberFormat(options, context));
			}
			return parenthesized;
		}

		const intlQuantity = domain.intlQuantity ?? ((value: Decimal) => value);

		function formatNumericValueCore(source: Decimal, capture?: CaptureParts, parentheses = false): readonly FormatToken[]
		{
			const plan = parentheses ? parenthesesVariant() : domain;

			return plan.render(intlQuantity(source), capture);
		}

		function formatNumericQuantity(quantity: Decimal, capture?: CaptureParts): readonly FormatToken[]
		{
			return formatNormalizedQuantity(normalizeNumericRange(quantity), capture);
		}

		/** Only extreme inputs can cross a numeric limit through supported scaling and rounding.
		 * The guard includes all compact exponents (up to 100), byte scales, and percentage scales. */
		function needsSaturationCheck(quantity: Decimal): boolean
		{
			if (!quantity.isFinite() || quantity.isZero())
			{
				return false;
			}

			const magnitude = Math.abs(quantity.toNumber());

			return magnitude >= 1e200 || magnitude <= 1e-200;
		}

		function displayedSaturation(quantity: Decimal, raw: readonly Intl.NumberFormatPart[], parts: readonly FormatToken[]): Decimal | undefined
		{
			const value = numericMetadata(quantity, raw, parts).quantity;
			const normalized = normalizeNumericRange(value);
			if (normalized !== value || (!normalized.isFinite() && !normalized.isNaN()))
			{
				return normalized;
			}

			// A scaled coefficient can underflow even when its domain value remains in range.
			const coefficient = displayedCoefficient(raw, spec, context);

			if (coefficient !== undefined)
			{
				const operand = parseQuantity((quantity.isNeg() ? "-" : "") + coefficient);
				const intlOperand = spec.kind === "percentage" ? operand.shift(-2) : operand;
				const normalizedOperand = normalizeNumericRange(intlOperand);

				if (normalizedOperand !== intlOperand)
				{
					return normalizedOperand;
				}
			}
			return undefined;
		}

		function formatNormalizedQuantity(quantity: Decimal, capture?: CaptureParts): readonly FormatToken[]
		{
			let zeroReplaced = false;
			const checkSaturation = needsSaturationCheck(quantity);
			let rendered: readonly Intl.NumberFormatPart[] = [];
			const captureParts: CaptureParts | undefined = zeroDisplay === undefined && !checkSaturation ? capture : raw => {
				rendered = raw;
				zeroReplaced = zeroDisplay !== undefined && displaysZero(raw, spec, context);
				capture?.(raw, zeroReplaced);
			};
			const parenthesize = shouldParenthesize(quantity);
			// Let Intl round the signed value and decide whether its rounded sign is visible.
			const parts = formatNumericValueCore(quantity, captureParts, parenthesize);

			if (checkSaturation)
			{
				const saturated = displayedSaturation(quantity, rendered, parts);
				if (saturated)
				{
					return formatNormalizedQuantity(saturated, capture);
				}
			}

			if (zeroReplaced)
			{
				return [{ type: "literal", value: zeroDisplay! }];
			}

			if (!parenthesize || !parts.some((part) => part.type === "sign"))
			{
				return parts;
			}

			return [
				{ type: "sign", value: "(" },
				...parts.filter((part) => part.type !== "sign" &&
					!(part.type === "literal" && /^[\u061c\u200e\u200f]+$/.test(part.value))),
				{ type: "sign", value: ")" },
			];
		}

		function formatNumericValue(value: NumericValue): readonly FormatToken[]
		{
			return formatNumericQuantity(parseQuantity(value));
		}

		/** Formats directly through Intl when no token-level wrapper behavior is requested. */
		function formatNumericString(value: NumericValue): string
		{
			return formatNumericQuantityString(normalizeNumericRange(parseQuantity(value)));
		}

		function formatNumericQuantityString(quantity: Decimal): string
		{
			if (stringRenderer && !shouldParenthesize(quantity) && !needsSaturationCheck(quantity))
			{
				return stringRenderer(intlQuantity(quantity));
			}

			return formatNormalizedQuantity(quantity).map(token => token.value).join("");
		}

		function saturateQuantity(quantity: Decimal): Decimal
		{
			if (!needsSaturationCheck(quantity))
			{
				return quantity;
			}

			let raw: readonly Intl.NumberFormatPart[] = [];
			const parts = formatNumericValueCore(quantity, captured => { raw = captured; });

			return displayedSaturation(quantity, raw, parts) ?? quantity;
		}

		function detailed(quantity: Decimal)
		{
			let raw: readonly Intl.NumberFormatPart[] = [];
			let zeroReplaced = false;
			const parts = formatNumericQuantity(quantity, (captured, replaced = false) => {
				raw = captured;
				zeroReplaced = replaced;
			});

			return zeroReplaced ? { parts, quantity: parseQuantity(0) } : { parts, ...numericMetadata(quantity, raw, parts) };
		}

		return {
			spec, context, formatter, resolution,
			automatic: domain.automatic ?? false,
			select: domain.select,
			format: formatNumericValue,
			formatString: formatNumericString,
			detailedValue: (value: NumericValue) => {
				const { quantity, ...metadata } = detailed(parseQuantity(value));
				return { ...metadata, roundedValue: quantity.toFixed() };
			},
			quantity: formatNumericQuantity,
			quantityString: (quantity: Decimal) => formatNumericQuantityString(normalizeNumericRange(quantity)),
			saturate: (quantity: Decimal) => saturateQuantity(normalizeNumericRange(quantity)),
			intlQuantity,
			parenthesizes: shouldParenthesize,
			detailed,
		};
	}
	return { prepare };
}

export type NumericEngine = ReturnType<typeof createNumericEngine>;
export type NumericExecution = ReturnType<NumericEngine["prepare"]>;
