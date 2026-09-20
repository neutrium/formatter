export const DURATION_DATE_UNITS = ["years", "months", "weeks", "days"] as const;
export const DURATION_TIME_UNITS = ["hours", "minutes", "seconds"] as const;
export const DURATION_SUBSECOND_UNITS = ["milliseconds", "microseconds", "nanoseconds"] as const;

/** Duration component names shared by option descriptors and value normalization. */
export const DURATION_UNITS = [
	...DURATION_DATE_UNITS,
	...DURATION_TIME_UNITS,
	...DURATION_SUBSECOND_UNITS,
] as const;

export type DurationUnit = typeof DURATION_UNITS[number];
