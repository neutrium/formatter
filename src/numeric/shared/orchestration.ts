import type { Decimal } from "@neutrium/decimal/arithmetic";
import type { AnyFormatCodec } from "../../core/codec.js";
import type { SeriesFormatOptions } from "../../core/series.js";
import type { RangeFormatToken } from "../../core/tokens.js";
import type { NumericValue } from "../../types.js";
import { normalizeNumericRange, parseQuantity } from "./decimal-string.js";
import type { NumericEngine, NumericExecution } from "./engine.js";
import { applyPartOverrides, createNumberFormat, intlFormatRangeToParts, tokensFromIntlRangeParts } from "./intl-format.js";

/** Formatting-only operations over the scalar plan shared with parsing. */
export function prepareNumericOperations(engine: NumericEngine, scalar: NumericExecution)
{
	const { spec, context } = scalar;
	const automatic = scalar.automatic;
	const select = (values: Iterable<Decimal>) => scalar.select?.(values) ?? spec;

	function selectSeriesSpec(values: readonly NumericValue[])
	{
		function* quantities(): Generator<Decimal>
		{
			for (const value of values)
			{
				yield normalizeNumericRange(parseQuantity(value));
			}
		}

		return automatic ? select(quantities()) : spec;
	}

	function series<Result>(
		values: readonly NumericValue[],
		options: SeriesFormatOptions,
		render: (plan: NumericExecution, quantity: Decimal) => Result
	): Result[]
	{
		if (options.scale === "individual" || !automatic)
		{
			return values.map(value => render(scalar, normalizeNumericRange(parseQuantity(value))));
		}

		// Parse each structural input once; select and prepare one shared scalar plan.
		const quantities = values.map(value => normalizeNumericRange(parseQuantity(value)));
		const selected = engine.prepare(select(quantities), context);

		return quantities.map(quantity => render(selected, quantity));
	}

	const seriesStrings = (values: readonly NumericValue[], _spec: unknown, _context: unknown, options: SeriesFormatOptions) =>
		series(values, options, (plan, quantity) => plan.quantityString(quantity));
	let separator: readonly RangeFormatToken[] | undefined;
	const fallbackSeparator = () => separator ??= rangeSeparator(scalar);
	const codec: AnyFormatCodec = {
		kind: spec.kind,
		format: scalar.format,
		formatString: scalar.formatString,
		formatDetailed: scalar.detailedValue,
		formatSeries: (values: readonly NumericValue[], _spec: unknown, _context: unknown, options: SeriesFormatOptions) =>
			series(values, options, (plan, quantity) => plan.quantity(quantity)),
		selectSeriesSpec,
		formatRange: (start: NumericValue, end: NumericValue) => formatRange(scalar, start, end, fallbackSeparator),
		resolve: () => scalar.resolution,
	};

	return {
		codec,
		seriesStrings
	};
}

function rangeSeparator({ spec, context }: NumericExecution): readonly RangeFormatToken[]
{
	const formatter = createNumberFormat({ kind: "number", locale: spec.locale }, context);
	const parts = intlFormatRangeToParts(formatter, "1", "2");

	if (parts)
	{
		let sawStart = false;
		const shared: typeof parts = [];

		for (const part of parts)
		{
			if (part.source === "startRange")
			{
				sawStart = true;
			}
			else if (part.source === "endRange" && sawStart)
			{
				break;
			}
			else if (part.source === "shared" && sawStart)
			{
				shared.push(part);
			}
		}

		if (shared.length > 0)
		{
			return tokensFromIntlRangeParts(shared);
		}
	}

	return [{ type: "literal", value: "–", source: "shared" }];
}

function formatRange(
	plan: NumericExecution,
	start: NumericValue,
	end: NumericValue,
	separator: () => readonly RangeFormatToken[]
): readonly RangeFormatToken[]
{
	const { spec } = plan;
	const first = plan.saturate(parseQuantity(start));
	const last = plan.saturate(parseQuantity(end));

	if (first.isNaN() || last.isNaN())
	{
		throw new RangeError("A formatted range cannot contain NaN");
	}

	const strategy = plan.resolution.rangeImplementation;

	if (strategy === "native" || strategy === "conditional")
	{
		const firstIntl = plan.intlQuantity(first);
		const lastIntl = plan.intlQuantity(last);
		const native = strategy === "native" || (!plan.parenthesizes(first) && !plan.parenthesizes(last) &&
			(spec.infinityDisplay === undefined || (firstIntl.isFinite() && lastIntl.isFinite())));

		if (native)
		{
			// A runtime method can disappear after preparation; retain the defensive fallback.
			const parts = intlFormatRangeToParts(plan.formatter, firstIntl.toValue(), lastIntl.toValue());

			if (parts)
			{
				return tokensFromIntlRangeParts(applyPartOverrides(parts, spec) as typeof parts);
			}
		}
	}

	return [
		...plan.quantity(first).map(token => ({ ...token, source: "startRange" as const })),
		// Returned tokens remain caller-owned; never expose the cached separator objects.
		...separator().map(token => ({ ...token })),
		...plan.quantity(last).map(token => ({ ...token, source: "endRange" as const })),
	];
}
