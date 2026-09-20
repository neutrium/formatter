const SNAPSHOTS = new WeakSet<object>();

/** Identity caches may only retain library-owned, recursively frozen data. */
export function isImmutableSnapshot(value: object): boolean
{
	return SNAPSHOTS.has(value);
}

/** Copy without invoking accessors or retaining caller-owned mutable objects. */
export function immutableSnapshot<Value>(value: Value, seen = new WeakMap<object, unknown>(), defaultLocale?: string): Value
{
	if (typeof value === "function")
	{
		throw new TypeError("Compiled specifications cannot contain functions");
	}

	if (value === null || typeof value !== "object")
	{
		return value;
	}

	const existing = seen.get(value);

	if (existing)
	{
		return existing as Value;
	}

	const prototype = Object.getPrototypeOf(value);

	if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
	{
		throw new TypeError("Compiled specifications support only plain records, null-prototype records, and arrays");
	}

	const output = Array.isArray(value) ? new Array(value.length) : Object.create(prototype);
	seen.set(value, output);

	for (const key of Reflect.ownKeys(value))
	{
		if (Array.isArray(value) && key === "length") continue;

		const descriptor = Object.getOwnPropertyDescriptor(value, key)!;

		if (!("value" in descriptor))
		{
			throw new TypeError("Compiled specifications cannot contain accessor properties");
		}

		Object.defineProperty(output, key, {
			value: key === "locale" && descriptor.value === undefined && defaultLocale !== undefined
				? defaultLocale : immutableSnapshot(descriptor.value, seen),
			enumerable: descriptor.enumerable,
			writable: false,
			configurable: false,
		});
	}

	if (defaultLocale !== undefined && !Object.prototype.hasOwnProperty.call(output, "locale"))
	{
		Object.defineProperty(output, "locale", { value: defaultLocale, enumerable: true });
	}

	Object.freeze(output);
	SNAPSHOTS.add(output);

	return output as Value;
}
/** Matches the recursively frozen records, arrays, and tuples in compiled specs. @inline */
type DeepReadonly<Value> = Value extends object ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> } : Value;

/** Bound specifications retain their effective locale across instances. @inline */
export type CompiledSpec<Spec> = Spec extends unknown
	? Omit<DeepReadonly<Spec>, "locale"> & {
		/** Explicit specification locale or the default captured during compilation. */
		readonly locale: string;
	} : never;

/** Bind the default only at the root, preserving prototypes, descriptors and cycles. */
export function immutableSpecSnapshot<Spec>(spec: Spec, defaultLocale: string): Spec & { readonly locale: string }
{
	return immutableSnapshot(spec, new WeakMap(), defaultLocale) as Spec & { readonly locale: string };
}
