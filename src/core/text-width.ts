/** Count Unicode code points without allocating an array; lone surrogates count as one. */
export function textWidth(value: string): number
{
	let width = value.length;
	for (let index = 0; index < value.length; index++)
	{
		const first = value.charCodeAt(index);

		if (first >= 0xd800 && first <= 0xdbff && index + 1 < value.length)
		{
			const second = value.charCodeAt(index + 1);
			if (second >= 0xdc00 && second <= 0xdfff) { width--; index++; }
		}
	}

	return width;
}
