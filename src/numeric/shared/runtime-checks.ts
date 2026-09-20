let exactDecimalStrings: boolean | undefined;
let roundingPriority: boolean | undefined;

/** Shared lazy safety probe; ordinary operations never initialize full diagnostics. */
export function supportsExactDecimalStrings(): boolean
{
	return exactDecimalStrings ??= probeExactDecimalStrings();
}

function probeExactDecimalStrings(): boolean
{
	try
	{
		const formatter = new Intl.NumberFormat("en-US", { useGrouping: false });
		const exact = (formatter.format as unknown as (value: string | bigint) => string)("9007199254740993");
		const fraction = "9007199254740993.25";
		const parts = (formatter.formatToParts as unknown as (value: string) => Intl.NumberFormatPart[])(fraction);

		return exact === formatter.format(9007199254740993n) &&
			(formatter.format as unknown as (value: string) => string)(fraction) === fraction &&
			parts.map((part) => part.value).join("") === fraction;
	}
	catch
	{
		return false;
	}
}

/** Fail before a runtime can silently coerce exact decimal strings to Number. */
export function requireExactDecimalStrings(): void
{
	if (!supportsExactDecimalStrings())
	{
		throw new RangeError("The current Intl runtime does not support exact decimal strings; upgrade the runtime or load an Intl.NumberFormat polyfill before importing the formatter");
	}
}

export function supportsNumberOption(name: string, value: unknown, options: Intl.NumberFormatOptions = {}): boolean
{
	try
	{
		const resolved = new Intl.NumberFormat("en-US", { ...options, [name]: value }).resolvedOptions() as unknown as
			Record<string, unknown>;
		return resolved[name] === value;
	}
	catch
	{
		return false;
	}
}

/** Some Intl implementations normalize the requested priority in resolvedOptions. */
export function supportsRoundingPriority(): boolean
{
	return roundingPriority ??= supportsNumberOption("roundingPriority", "morePrecision");
}
