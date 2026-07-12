/**
 * User-facing validation error with automatic redaction of
 * sensitive values.
 */

import type { ValidationIssue } from "./validation-issue.js";
import { ISSUES_FIELD_SPEC, validationMessage } from "./validation-issue.js";
import { CodedError } from "./coded-error.js";
import { UserError } from "./user-error.js";

/**
 * Redaction placeholder used to replace sensitive values.
 */
const REDACTED = "****";

/**
 * Replaces every occurrence of each sensitive value in `text`.
 */
function redact(text: string, sensitive: readonly string[]): string {
	let result = text;
	for (const value of sensitive) {
		if (value.length === 0) {
			continue;
		}

		result = result.replaceAll(value, REDACTED);
	}

	return result;
}

/**
 * Redacts sensitive strings from issue message and value fields.
 */
function redactIssue(
	issue: ValidationIssue,
	sensitive: readonly string[],
): ValidationIssue {
	const message = redact(issue.message, sensitive);
	let value = issue.value;

	if (typeof value === "string") {
		value = redact(value, sensitive);
	} else {
		for (const entry of sensitive) {
			if (value === entry) {
				value = REDACTED;
				break;
			}
		}
	}

	let redacted: ValidationIssue = {
		path: issue.path,
		message,
	};

	if (issue.code !== undefined) {
		redacted = { ...redacted, code: issue.code };
	}

	if (issue.expected !== undefined) {
		redacted = { ...redacted, expected: issue.expected };
	}

	if ("value" in issue) {
		redacted = { ...redacted, value };
	}

	return redacted;
}

/**
 * Represents user-facing validation failures safe to display.
 *
 * Extends {@link UserError} so the error is safe for end-user
 * presentation. Carries structured {@link ValidationIssue} items
 * and automatically redacts any sensitive values from issue
 * messages at construction time.
 */
export class UserValidationError extends UserError {
	readonly issues: readonly ValidationIssue[];

	constructor(
		code: string,
		issues: readonly ValidationIssue[],
		sensitive?: readonly string[],
		message?: string,
		cause?: unknown,
	) {
		const shouldRedact = sensitive && sensitive.length > 0;

		let redacted: readonly ValidationIssue[];
		if (shouldRedact) {
			redacted = issues.map((issue) => redactIssue(issue, sensitive));
		} else {
			redacted = issues;
		}

		let derived: string;
		if (message && shouldRedact) {
			derived = redact(message, sensitive);
		} else if (message) {
			derived = message;
		} else {
			derived = validationMessage(issues.length);
		}

		super(code, derived, cause);
		this.issues = redacted;
	}

	/**
	 * Duck-type guard for `UserValidationError` instances.
	 */
	static override isInstance(err: unknown): err is UserValidationError {
		return CodedError.isInstance(err, "E_USER", ISSUES_FIELD_SPEC);
	}

	/**
	 * Extends the base JSON with the `issues` list.
	 */
	override toJSON(): Record<string, unknown> {
		const json = { ...super.toJSON(), issues: this.issues };
		return json;
	}
}
