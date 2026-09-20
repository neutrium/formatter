import { textWidth as width } from "./text-width.js";
/**
 * Whether automatic compact or byte magnitudes are selected per value or once
 * for the complete series. Defaults to `shared`.
 */
export type SeriesScale = "individual" | "shared";
/** Text alignment supported by column formatting; defaults to `decimal`. */
export type ColumnAlignment = "left" | "right" | "decimal";

/** Controls scale selection while formatting a collection. */
export interface SeriesFormatOptions
{
	/** Uses one magnitude for the complete series or selects one per value. Defaults to `shared`. */
	scale?: SeriesScale;
}

/** Controls scale selection and padding while formatting a column. */
export interface ColumnFormatOptions extends SeriesFormatOptions
{
	/** Alignment applied after formatting. Defaults to `decimal`. */
	align?: ColumnAlignment;
	/** Exactly one Unicode code point used for padding. Defaults to a space. */
	fill?: string;
}

export type ResolvedColumnFormatOptions = Required<Pick<ColumnFormatOptions, "align" | "fill">>;

function padding(fill: string, count: number): string
{
	return fill.repeat(Math.max(count, 0));
}

export interface ColumnDecimalPosition
{
	/** Unicode code-point offset to the decimal separator, or -1 when absent. */
	offset: number;
	separator: string;
}

/** Resolve and validate padding options before formatting any column values. */
export function columnLayout(options: ColumnFormatOptions): ResolvedColumnFormatOptions
{
	const fill = options.fill === undefined ? " " : options.fill;

	if (typeof fill !== "string" || width(fill) !== 1)
	{
		throw new RangeError("Column fill must be exactly one Unicode code point");
	}

	const align = options.align === undefined ? "decimal" : options.align;

	if (align !== "left" && align !== "right" && align !== "decimal")
	{
		throw new RangeError(`Unsupported column alignment: ${align}`);
	}

	return { align, fill };
}

export function alignColumn(
	values: readonly string[],
	decimalPositions: readonly ColumnDecimalPosition[],
	{ align, fill }: ResolvedColumnFormatOptions,
): string[]
{
	if (values.length === 0)
	{
		return [];
	}

	if (align === "left" || align === "right")
	{
		const widths = values.map(width);
		let target = 0;

		for (const size of widths)
		{
			target = Math.max(target, size);
		}

		return values.map((value, index) => align === "left"
			? value + padding(fill, target - widths[index])
			: padding(fill, target - widths[index]) + value);
	}

	const cells = values.map((value, index) => {
		const position = decimalPositions[index];

		return !position || position.offset < 0
			? { value, left: width(value), right: 0, separator: "" }
			: {
				value,
				left: position.offset,
				right: width(value) - position.offset - width(position.separator),
				separator: position.separator,
			};
	});
	let left = 0;
	let right = 0;
	let separatorWidth = 0;

	for (const cell of cells)
	{
		left = Math.max(left, cell.left);
		right = Math.max(right, cell.right);
		separatorWidth = Math.max(separatorWidth, width(cell.separator));
	}

	return cells.map((cell) => {
		const prefix = padding(fill, left - cell.left);

		if (cell.separator)
		{
			return prefix + cell.value + padding(fill, right - cell.right);
		}

		return prefix + cell.value + padding(fill, separatorWidth + right);
	});
}
