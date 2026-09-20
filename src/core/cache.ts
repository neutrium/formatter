/** A small insertion-ordered cache with least-recently-used eviction. */
export class LruCache<Key, Value>
{
	private readonly values = new Map<Key, Value>();

	constructor(private readonly capacity: number)
	{
		if (!Number.isSafeInteger(capacity) || capacity < 1)
		{
			throw new RangeError("Cache capacity must be a positive integer");
		}
	}

	get(key: Key): Value | undefined
	{
		const value = this.values.get(key);

		if (value === undefined)
		{
			return undefined;
		}

		this.values.delete(key);
		this.values.set(key, value);

		return value;
	}

	set(key: Key, value: Value): Value
	{
		if (this.values.has(key))
		{
			this.values.delete(key);
		}

		this.values.set(key, value);

		if (this.values.size > this.capacity)
		{
			const oldest = this.values.keys().next().value;

			if (oldest !== undefined)
			{
				this.values.delete(oldest);
			}
		}

		return value;
	}
}
