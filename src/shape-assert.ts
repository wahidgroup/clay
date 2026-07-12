/**
 * Assertion-style shape validators that throw {@link ValidationError}.
 *
 * Separated from the core shape module to avoid a circular
 * dependency between `shape.ts` and `coded-error.ts`.
 */

import type { ValidationIssue } from "./errors/validation-issue.js";
import type { FieldDef, ShapeOf, ShapeResult } from "./shape.js";
import { ValidationError } from "./errors/validation-error.js";
import { validateObject } from "./shape.js";

/**
 * Compiled shape validator with predicate, try, assert, and as APIs.
 */
export interface ShapeValidator<
	F extends Record<string, FieldDef>,
	S extends boolean = false,
> {
	readonly fields: F;
	readonly strict: S;
	is(value: unknown): value is ShapeOf<F, S>;
	try(value: unknown): ShapeResult<ShapeOf<F, S>>;
	assert(value: unknown, message?: string): void;
	as(value: unknown, message?: string): ShapeOf<F, S>;
}

/**
 * Asserts that `value` conforms to the spec. Required fields must
 * be present and match the expected type; optional fields are
 * validated only when present. Extra fields are permitted.
 *
 * @throws ValidationError when one or more constraints are violated.
 */
export function assertShape<F extends Record<string, FieldDef>>(
	value: unknown,
	fields: F,
	message?: string,
): asserts value is ShapeOf<F> {
	const issues = validateObject(value, fields, false);
	if (issues.length > 0) {
		throw new ValidationError("SHAPE_MISMATCH", issues, message);
	}
}

/**
 * Like {@link assertShape} but additionally rejects any field not
 * declared in the spec. Strict mode is applied recursively to
 * nested object specs.
 *
 * @throws ValidationError when one or more constraints are violated
 *         or an extra field is present.
 */
export function assertStrictShape<F extends Record<string, FieldDef>>(
	value: unknown,
	fields: F,
	message?: string,
): asserts value is ShapeOf<F, true> {
	const issues = validateObject(value, fields, true);
	if (issues.length > 0) {
		throw new ValidationError("SHAPE_MISMATCH", issues, message);
	}
}

/**
 * Validates and returns the narrowed value. Throws on violation.
 *
 * Convenience wrapper around {@link assertShape} for inline use.
 */
export function asShape<F extends Record<string, FieldDef>>(
	value: unknown,
	fields: F,
	message?: string,
): ShapeOf<F> {
	assertShape(value, fields, message);
	return value;
}

/**
 * Strict variant of {@link asShape}. Rejects extra fields.
 */
export function asStrictShape<F extends Record<string, FieldDef>>(
	value: unknown,
	fields: F,
	message?: string,
): ShapeOf<F, true> {
	assertStrictShape(value, fields, message);
	return value;
}

/**
 * Narrows when issues are empty (non-strict).
 */
function isValidatedShape<F extends Record<string, FieldDef>>(
	value: unknown,
	_fields: F,
	issues: readonly ValidationIssue[],
): value is ShapeOf<F> {
	return issues.length === 0;
}

/**
 * Narrows when issues are empty (strict).
 */
function isValidatedStrictShape<F extends Record<string, FieldDef>>(
	value: unknown,
	_fields: F,
	issues: readonly ValidationIssue[],
): value is ShapeOf<F, true> {
	return issues.length === 0;
}

/**
 * Builds a reusable non-strict shape validator (compile-once fields).
 */
export function createShape<F extends Record<string, FieldDef>>(
	fields: F,
): ShapeValidator<F, false> {
	Object.freeze(fields);

	return {
		fields,
		strict: false,
		is(value: unknown): value is ShapeOf<F> {
			const issues = validateObject(value, fields, false);
			return issues.length === 0;
		},
		try(value: unknown): ShapeResult<ShapeOf<F>> {
			const issues = validateObject(value, fields, false);
			if (!isValidatedShape(value, fields, issues)) {
				return { ok: false, issues };
			}

			return { ok: true, value };
		},
		assert(value: unknown, message?: string): void {
			assertShape(value, fields, message);
		},
		as(value: unknown, message?: string): ShapeOf<F> {
			return asShape(value, fields, message);
		},
	};
}

/**
 * Builds a reusable strict shape validator (compile-once fields).
 */
export function createStrictShape<F extends Record<string, FieldDef>>(
	fields: F,
): ShapeValidator<F, true> {
	Object.freeze(fields);

	return {
		fields,
		strict: true,
		is(value: unknown): value is ShapeOf<F, true> {
			const issues = validateObject(value, fields, true);
			return issues.length === 0;
		},
		try(value: unknown): ShapeResult<ShapeOf<F, true>> {
			const issues = validateObject(value, fields, true);
			if (!isValidatedStrictShape(value, fields, issues)) {
				return { ok: false, issues };
			}

			return { ok: true, value };
		},
		assert(value: unknown, message?: string): void {
			assertStrictShape(value, fields, message);
		},
		as(value: unknown, message?: string): ShapeOf<F, true> {
			return asStrictShape(value, fields, message);
		},
	};
}
