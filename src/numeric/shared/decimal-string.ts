import { Decimal, type RoundingMode as DecimalRoundingMode } from "@neutrium/decimal/arithmetic";
import { NumericValue, RoundingMode } from "../../types.js";
import { LruCache } from "../../core/cache.js";

// Own the configuration: callers may independently configure any Decimal tier.
const ExactDecimal = Decimal.clone({
	precision: 20, rounding: "half-up", modulo: "down",
	toExpNeg: -7, toExpPos: 21, minE: -9e15, maxE: 9e15,
	maxOutputDigits: 1_000_000, maxPrefixedDigits: 1_000_000,
});
const CALCULATIONS = new LruCache<number, typeof ExactDecimal>(64);

function calculationForPrecision(precision: number): typeof ExactDecimal
{
	return CALCULATIONS.get(precision) ?? CALCULATIONS.set(precision, ExactDecimal.clone({ precision }));
}

// Byte scales use powers 0, 10, ... 80. Keep the general helpers valid for other powers.
const BINARY_FACTORS = Array.from({ length: 9 }, (_, exponent) => 2n ** BigInt(exponent * 10));
const BINARY_DIVISORS = Array.from({ length: 9 }, (_, exponent) => 5n ** BigInt(exponent * 10));

const ROUNDING_MODES: Record<RoundingMode, DecimalRoundingMode> = {
	ceil: "ceil", floor: "floor", expand: "up", trunc: "down",
	halfCeil: "half-ceil", halfFloor: "half-floor", halfExpand: "half-up",
	halfTrunc: "half-down", halfEven: "half-even",
};

export function isRoundingMode(value: unknown): value is RoundingMode
{
	return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROUNDING_MODES, value);
}

export function parseQuantity(value: NumericValue): Decimal
{
	// Decimal owns numeric syntax and limits. Adapt structural values once and
	// retain surrounding-whitespace tolerance without coercing through Number.
	const source = typeof value === "object" && value !== null ? value.toValue() : value;
	return new ExactDecimal(typeof source === "string" ? source.trim() : source);
}

/** Saturate numeric formatting inputs without rounding finite, nonzero decimals. */
export function normalizeNumericRange(value: Decimal): Decimal
{
	if (!value.isFinite() || value.isZero())
	{
		return value;
	}

	const number = value.toNumber();

	if (Number.isFinite(number) && number !== 0)
	{
		return value;
	}

	return new ExactDecimal((value.isNeg() ? "-" : "") + (number === 0 ? "0" : "Infinity"));
}

/** Add exact presentation witnesses without the default arithmetic precision limit. */
export function addQuantities(left: Decimal, right: Decimal): Decimal
{
	if (!left.isFinite() || !right.isFinite())
	{
		return left.add(right);
	}

	const precision = Math.max(0, decimalOrder(left), decimalOrder(right)) + Math.max(left.dp(), right.dp()) + 2;
	const Calculation = calculationForPrecision(precision);

	return new ExactDecimal(new Calculation(left).add(right));
}

function scalePowerOfTwo(value: Decimal, power: number, divide: boolean): Decimal
{
	if (!Number.isSafeInteger(power) || power < 0)
	{
		throw new RangeError("Power must be a non-negative safe integer");
	}

	if (!value.isFinite() || value.isZero() || power === 0)
	{
		return value;
	}

	// Multiplication needs at most input digits + power + 1 significant digits.
	// Dividing by 2^power equals multiplying by 5^power then shifting: exact,
	// even when the caller requests more digits than the default precision.
	const precision = value.precision() + power + 1;
	const Calculation = calculationForPrecision(precision);
	const factor = (divide ? BINARY_DIVISORS : BINARY_FACTORS)[power / 10] ??
		(divide ? 5n : 2n) ** BigInt(power);
	const product = new Calculation(value).mul(factor);

	return new ExactDecimal(divide ? product.shift(-power) : product);
}

export function multiplyPowerOfTwo(value: Decimal, power: number): Decimal
{
	return scalePowerOfTwo(value, power, false);
}

export function dividePowerOfTwo(value: Decimal, power: number): Decimal
{
	return scalePowerOfTwo(value, power, true);
}

export function decimalOrder(value: Decimal): number
{
	if (!value.isFinite() || value.isZero())
	{
		return 0;
	}

	// Include trailing integer zeros to recover the decimal exponent exactly.
	return value.precision(true) - value.dp() - 1;
}

export function positivePowerOfTen(value: number): number
{
	if (!Number.isSafeInteger(value) || value <= 0)
	{
		throw new RangeError("Scale must be a positive power of ten");
	}

	const source = String(value);

	if (!/^10*$/.test(source))
	{
		throw new RangeError("Scale must be a positive power of ten");
	}

	return source.length - 1;
}

export function roundQuantityToInteger(value: Decimal, mode: RoundingMode = "halfExpand"): Decimal
{
	return value.toDP(0, ROUNDING_MODES[mode]);
}
