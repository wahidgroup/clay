/**
 * Shared types and helpers for validation errors.
 */

import type { FieldDef } from "../shape.js";

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
 */
export interface ValidationIssue {
	readonly path: string;
	readonly message: string;
	readonly code?: ValidationIssueCode;
	readonly expected?: string;
	readonly value?: unknown;
}

/**
 * Shared `FieldDef` for duck-type checking the `issues` property
 * on validation error instances.
 */
export const ISSUES_FIELD_SPEC: Record<string, FieldDef> = {
	issues: {
		type: "array",
		items: {
			type: "object",
			shape: {
				path: "string",
				message: "string",
				code: { type: "string", optional: true },
				expected: { type: "string", optional: true },
			},
		},
	},
};

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
