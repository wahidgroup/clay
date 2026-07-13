/**
 * Shared types and helpers for validation errors.
 */

/**
 * Machine-readable classification for a single validation failure.
 */
export type ValidationIssueCode =
	| "type"
	| "missing"
	| "unexpected"
	| "null"
	| "literal"
	| "union"
	| "discriminant"
	| "unknown_variant"
	| "length"
	| "unique"
	| "range"
	| "pattern"
	| "refine"
	| "spec";

/**
 * A single validation issue with path, human message, and optional
 * structured fields for programmatic consumers.
 *
 * Engines omit `value` by default so failures do not echo untrusted
 * input. Callers MAY set `value` when building issues manually.
 */
export interface ValidationIssue {
	readonly path: string;
	readonly message: string;
	readonly code?: ValidationIssueCode;
	readonly expected?: string;
	readonly value?: unknown;
}

/**
 * Duck-type check for an `issues` array of validation issues.
 *
 * Kept free of `shape` imports so error modules do not load the
 * validation engine (or `decimal.js`).
 */
export function hasValidationIssues(err: object): boolean {
	const issues: unknown = Reflect.get(err, "issues");
	if (!Array.isArray(issues)) {
		return false;
	}

	for (const item of issues) {
		if (typeof item !== "object" || item === null) {
			return false;
		}

		const path: unknown = Reflect.get(item, "path");
		const message: unknown = Reflect.get(item, "message");
		if (typeof path !== "string") {
			return false;
		}
		if (typeof message !== "string") {
			return false;
		}

		const code: unknown = Reflect.get(item, "code");
		if (code !== undefined && typeof code !== "string") {
			return false;
		}

		const expected: unknown = Reflect.get(item, "expected");
		if (expected !== undefined && typeof expected !== "string") {
			return false;
		}
	}

	return true;
}

/**
 * Builds the default validation failure message.
 */
export function validationMessage(issueCount: number): string {
	let label = "issues";
	if (issueCount === 1) {
		label = "issue";
	}

	const message = `Validation failed (${issueCount} ${label})`;
	return message;
}
