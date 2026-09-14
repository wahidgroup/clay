/**
 * Assertion and cast forms of the type guards in `guards.ts`.
 *
 * Each guard `isX` derives an `assertX` that narrows in place, and each
 * `assertX` derives an `asX` that returns the narrowed value.
 */

import type { ValidationIssue } from "./errors/validation-issue.js";
import { ValidationError } from "./errors/validation-error.js";
import {
	hasProperties,
	isArray,
	isArrayOf,
	isBoolean,
	isDefined,
	isError,
	isFiniteNumber,
	isNonEmptyString,
	isNonNull,
	isNumber,
	isOneOf,
	isPlainRecord,
	isRecord,
	isString,
	isSystemError,
} from "./guards.js";

/**
 * Error code on every failure this module throws.
 */
const TYPE_MISMATCH = "TYPE_MISMATCH";

/**
 * Assertion that narrows an unknown value to `T`.
 *
 * TypeScript requires an explicit annotation on every assertion it
 * calls, so each derived export declares its type.
 */
type Assertion<T> = (value: unknown, message?: string) => asserts value is T;

/**
 * Builds the failure for a guard that rejected `value`.
 *
 * The issue omits `value` so the error does not echo untrusted input. A
 * rejected `Error` becomes the `cause`, so a rethrow keeps its stack.
 */
function mismatch(value: unknown, expected: string, message?: string): ValidationError {
	const issue: ValidationIssue = {
		path: "",
		code: "type",
		message: `Value must be ${expected}`,
		expected,
	};

	let cause: unknown;
	if (isError(value)) {
		cause = value;
	}

	const detail = message ?? issue.message;
	const failure = new ValidationError(TYPE_MISMATCH, [issue], detail, cause);
	return failure;
}

/**
 * Derives the assertion for a one-argument guard.
 */
function assertion<V, T extends V>(
	guard: (value: V) => value is T,
	expected: string,
): (value: V, message?: string) => asserts value is T {
	return (value, message) => {
		const passed = guard(value);
		if (!passed) {
			throw mismatch(value, expected, message);
		}
	};
}

/**
 * Derives the assertion for a guard that takes one argument after the
 * value, such as the member list of {@link isOneOf}.
 */
function assertionWith<V, A, T extends V>(
	guard: (value: V, arg: A) => value is T,
	expected: (arg: A) => string,
): (value: V, arg: A, message?: string) => asserts value is T {
	return (value, arg, message) => {
		const passed = guard(value, arg);
		if (!passed) {
			const label = expected(arg);
			throw mismatch(value, label, message);
		}
	};
}

/**
 * Derives the cast that returns what `assert` narrowed.
 */
function cast<V, T extends V>(
	assert: (value: V, message?: string) => asserts value is T,
): (value: V, message?: string) => T {
	return (value, message) => {
		assert(value, message);
		return value;
	};
}

/**
 * Derives the cast for an assertion that takes one argument after the
 * value.
 */
function castWith<V, A, T extends V>(
	assert: (value: V, arg: A, message?: string) => asserts value is T,
): (value: V, arg: A, message?: string) => T {
	return (value, arg, message) => {
		assert(value, arg, message);
		return value;
	};
}

/**
 * Adapts the rest-argument {@link hasProperties} to one key-list argument,
 * so the optional message can follow the keys.
 */
function hasPropertyList<K extends string>(value: unknown, keys: readonly K[]): value is Record<K, unknown> {
	return hasProperties(value, ...keys);
}

// ---------------------------------------------------------------------------
// Primitive assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that `value` passes {@link isString}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertString: Assertion<string> = assertion(isString, "string");

/**
 * Returns `value` narrowed by {@link isString}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asString = cast(assertString);

/**
 * Asserts that `value` passes {@link isNumber}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertNumber: Assertion<number> = assertion(isNumber, "number");

/**
 * Returns `value` narrowed by {@link isNumber}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asNumber = cast(assertNumber);

/**
 * Asserts that `value` passes {@link isFiniteNumber}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertFiniteNumber: Assertion<number> = assertion(isFiniteNumber, "finite number");

/**
 * Returns `value` narrowed by {@link isFiniteNumber}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asFiniteNumber = cast(assertFiniteNumber);

/**
 * Asserts that `value` passes {@link isNonEmptyString}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertNonEmptyString: Assertion<string> = assertion(isNonEmptyString, "non-empty string");

/**
 * Returns `value` narrowed by {@link isNonEmptyString}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asNonEmptyString = cast(assertNonEmptyString);

/**
 * Asserts that `value` passes {@link isBoolean}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertBoolean: Assertion<boolean> = assertion(isBoolean, "boolean");

/**
 * Returns `value` narrowed by {@link isBoolean}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asBoolean = cast(assertBoolean);

// ---------------------------------------------------------------------------
// Nullability assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that `value` passes {@link isNonNull}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertNonNull: <T>(value: T, message?: string) => asserts value is NonNullable<T> = assertion(
	isNonNull,
	"non-null",
);

/**
 * Returns `value` narrowed by {@link isNonNull}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asNonNull = cast(assertNonNull);

/**
 * Asserts that `value` passes {@link isDefined}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertDefined: <T>(value: T, message?: string) => asserts value is Exclude<T, undefined> = assertion(
	isDefined,
	"defined",
);

/**
 * Returns `value` narrowed by {@link isDefined}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asDefined = cast(assertDefined);

// ---------------------------------------------------------------------------
// Collection / instance assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that `value` passes {@link isArray}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertArray: Assertion<unknown[]> = assertion(isArray, "array");

/**
 * Returns `value` narrowed by {@link isArray}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asArray = cast(assertArray);

/**
 * Asserts that `value` passes {@link isArrayOf} with `guard`.
 *
 * @throws ValidationError when `value` is not an array or an item fails `guard`.
 */
export const assertArrayOf: <T>(
	value: unknown,
	guard: (item: unknown) => item is T,
	message?: string,
) => asserts value is T[] = assertionWith(isArrayOf, () => "array of items that pass the guard");

/**
 * Returns `value` narrowed by {@link isArrayOf} with `guard`.
 *
 * @throws ValidationError when `value` is not an array or an item fails `guard`.
 */
export const asArrayOf = castWith(assertArrayOf);

/**
 * Asserts that `value` passes {@link isError}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertError: Assertion<Error> = assertion(isError, "Error");

/**
 * Returns `value` narrowed by {@link isError}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asError = cast(assertError);

// ---------------------------------------------------------------------------
// Object assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that `value` passes {@link isRecord}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertRecord: Assertion<Record<string, unknown>> = assertion(isRecord, "object");

/**
 * Returns `value` narrowed by {@link isRecord}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asRecord = cast(assertRecord);

/**
 * Asserts that `value` passes {@link isPlainRecord}.
 *
 * @throws ValidationError when the guard fails.
 */
export const assertPlainRecord: Assertion<Record<string, unknown>> = assertion(isPlainRecord, "plain object");

/**
 * Returns `value` narrowed by {@link isPlainRecord}.
 *
 * @throws ValidationError when the guard fails.
 */
export const asPlainRecord = cast(assertPlainRecord);

/**
 * Asserts that `value` passes {@link hasProperties} with every key in
 * `keys`.
 *
 * @throws ValidationError when `value` is not an object or lacks a key.
 */
export const assertProperties: <K extends string>(
	value: unknown,
	keys: readonly K[],
	message?: string,
) => asserts value is Record<K, unknown> = assertionWith(hasPropertyList, (keys) => {
	const listed = keys.join(", ");
	return `object with properties ${listed}`;
});

/**
 * Returns `value` narrowed by {@link hasProperties} with every key in
 * `keys`.
 *
 * @throws ValidationError when `value` is not an object or lacks a key.
 */
export const asProperties = castWith(assertProperties);

// ---------------------------------------------------------------------------
// Narrowing assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that `value` passes {@link isOneOf} with `values`.
 *
 * @throws ValidationError when `value` is not a member of `values`.
 */
export const assertOneOf: <T extends string | number | boolean>(
	value: unknown,
	values: readonly T[],
	message?: string,
) => asserts value is T = assertionWith(isOneOf, (values) => {
	const listed = values.join(", ");
	return `one of [${listed}]`;
});

/**
 * Returns `value` narrowed by {@link isOneOf} with `values`.
 *
 * @throws ValidationError when `value` is not a member of `values`.
 */
export const asOneOf = castWith(assertOneOf);

/**
 * Asserts that `err` passes {@link isSystemError} with `code`.
 *
 * A rejected `Error` becomes the thrown error's `cause`.
 *
 * @throws ValidationError when `err` is not an `Error` with that `code`.
 */
export const assertSystemError: <C extends string>(
	err: unknown,
	code: C,
	message?: string,
) => asserts err is Error & { readonly code: C } = assertionWith(isSystemError, (code) => `Error with code ${code}`);

/**
 * Returns `err` narrowed by {@link isSystemError} with `code`.
 *
 * A rejected `Error` becomes the thrown error's `cause`.
 *
 * @throws ValidationError when `err` is not an `Error` with that `code`.
 */
export const asSystemError = castWith(assertSystemError);
