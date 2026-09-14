/**
 * Runtime type guards for narrowing `unknown` values.
 */

// ---------------------------------------------------------------------------
// Primitive guards
// ---------------------------------------------------------------------------

/**
 * Narrows an unknown value to `string`.
 */
export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/**
 * Narrows an unknown value to `number`.
 */
export function isNumber(value: unknown): value is number {
	return typeof value === "number";
}

/**
 * Narrows an unknown value to a `number` that is not `NaN`, `Infinity`,
 * or `-Infinity`.
 */
export function isFiniteNumber(value: unknown): value is number {
	return Number.isFinite(value);
}

/**
 * Narrows an unknown value to a `string` with at least one character.
 *
 * A whitespace-only string passes, so trim first when blank input is
 * invalid.
 */
export function isNonEmptyString(value: unknown): value is string {
	return isString(value) && value.length > 0;
}

/**
 * Narrows an unknown value to `boolean`.
 */
export function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

// ---------------------------------------------------------------------------
// Nullability guards
// ---------------------------------------------------------------------------

/**
 * Excludes both `null` and `undefined` from `T`.
 */
export function isNonNull<T>(value: T): value is NonNullable<T> {
	return value !== null && value !== undefined;
}

/**
 * Excludes `undefined` from `T` (allows `null`).
 */
export function isDefined<T>(value: T): value is Exclude<T, undefined> {
	return value !== undefined;
}

// ---------------------------------------------------------------------------
// Collection / instance guards
// ---------------------------------------------------------------------------

/**
 * Narrows an unknown value to `unknown[]`.
 */
export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

/**
 * Narrows an unknown value to an array whose every item passes `guard`.
 *
 * An empty array passes. Compose it with any guard, for example
 * `isArrayOf(value, isString)` for `string[]`.
 */
export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
	return isArray(value) && value.every(guard);
}

/**
 * Narrows an unknown value to `Error`.
 */
export function isError(value: unknown): value is Error {
	return value instanceof Error;
}

// ---------------------------------------------------------------------------
// Object guards
// ---------------------------------------------------------------------------

/**
 * Narrows an unknown value to a non-null object (includes arrays).
 */
function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

/**
 * Narrows an unknown value to a string-keyed record.
 *
 * Returns `false` for `null`, primitives, and arrays.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value) && !isArray(value);
}

/**
 * Narrows an unknown value to a record whose prototype is
 * `Object.prototype` or `null`.
 *
 * Object literals, `JSON.parse` output, and `Object.create(null)` pass.
 * A `Map`, a `Date`, or a class instance fails, because its entries live
 * outside its own enumerable keys.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) {
		return false;
	}

	const proto: unknown = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Duck-type guard that checks whether `value` is a non-null object
 * containing all of the specified keys.
 */
export function hasProperties<K extends string>(value: unknown, ...keys: K[]): value is Record<K, unknown> {
	if (!isRecord(value)) {
		return false;
	}

	for (const key of keys) {
		if (!Object.hasOwn(value, key)) {
			return false;
		}
	}

	return true;
}

// ---------------------------------------------------------------------------
// Narrowing helpers
// ---------------------------------------------------------------------------

/**
 * Narrows `value` to a member of a readonly literal tuple.
 */
export function isOneOf<T extends string | number | boolean>(value: unknown, values: readonly T[]): value is T {
	for (const candidate of values) {
		if (value === candidate) {
			return true;
		}
	}

	return false;
}

/**
 * Narrows `err` to an `Error` whose `code` property equals `code`
 * (for example `"ENOENT"` or an app-defined code).
 */
export function isSystemError<C extends string>(err: unknown, code: C): err is Error & { readonly code: C } {
	if (!(err instanceof Error) || !("code" in err)) {
		return false;
	}

	const errCode: unknown = Reflect.get(err, "code");
	return errCode === code;
}

// ---------------------------------------------------------------------------
// Exhaustive check
// ---------------------------------------------------------------------------

/**
 * Enforces exhaustive `switch`/`if` checks at compile time.
 * Throws at runtime if reached.
 */
export function assertNever(value: never): never {
	throw new TypeError(`Unexpected value: ${String(value)}`);
}
