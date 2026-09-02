/**
 * Assertion-style shape validators that throw {@link ValidationError}.
 *
 * Lives apart from `shape.ts` so the validation engine stays free of
 * error-class imports.
 */

import type { FieldDef, ShapeOf, ShapeResult } from "./shape.js";
import { ValidationError } from "./errors/validation-error.js";
import { hasNoShapeIssues, validateObject } from "./shape.js";

/**
 * Compiled shape validator with predicate, try, assert, and as APIs.
 */
export interface ShapeValidator<F extends Record<string, FieldDef>, S extends boolean = false> {
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
	if (!hasNoShapeIssues<ShapeOf<F>>(value, issues)) {
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
	if (!hasNoShapeIssues<ShapeOf<F, true>>(value, issues)) {
		throw new ValidationError("SHAPE_MISMATCH", issues, message);
	}
}

/**
 * Validates and returns the narrowed value. Throws on violation.
 *
 * Convenience wrapper around {@link assertShape} for inline use.
 */
export function asShape<F extends Record<string, FieldDef>>(value: unknown, fields: F, message?: string): ShapeOf<F> {
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
 * Shared factory for soft and strict compiled validators.
 */
function buildShapeValidator<F extends Record<string, FieldDef>, S extends boolean>(
	fields: F,
	strict: S,
): ShapeValidator<F, S> {
	Object.freeze(fields);

	return {
		fields,
		strict,
		is(value: unknown): value is ShapeOf<F, S> {
			const issues = validateObject(value, fields, strict);
			return hasNoShapeIssues<ShapeOf<F, S>>(value, issues);
		},
		try(value: unknown): ShapeResult<ShapeOf<F, S>> {
			const issues = validateObject(value, fields, strict);
			if (!hasNoShapeIssues<ShapeOf<F, S>>(value, issues)) {
				return { ok: false, issues };
			}

			return { ok: true, value };
		},
		assert(value: unknown, message?: string): void {
			if (strict) {
				assertStrictShape(value, fields, message);
				return;
			}

			assertShape(value, fields, message);
		},
		as(value: unknown, message?: string): ShapeOf<F, S> {
			if (strict) {
				return asStrictShape(value, fields, message);
			}

			return asShape(value, fields, message);
		},
	};
}

/**
 * Builds a reusable non-strict shape validator (compile-once fields).
 */
export function createShape<F extends Record<string, FieldDef>>(fields: F): ShapeValidator<F, false> {
	return buildShapeValidator(fields, false);
}

/**
 * Builds a reusable strict shape validator (compile-once fields).
 */
export function createStrictShape<F extends Record<string, FieldDef>>(fields: F): ShapeValidator<F, true> {
	return buildShapeValidator(fields, true);
}
