/**
 * Error class for API / HTTP errors with a status code.
 */

import { CodedError } from "./coded-error.js";

/**
 * Represents errors originating from API calls.
 *
 * Carries an HTTP `status` code alongside the standard
 * `kind` / `code` discriminant.
 */
export class ApiError extends CodedError {
	readonly kind = "E_API";
	readonly status: number;

	constructor(
		readonly code: string,
		status: number,
		message: string,
		cause?: unknown,
	) {
		super(message, cause);
		this.status = status;
	}

	/**
	 * Duck-type guard for `ApiError` instances.
	 *
	 * Validates `kind`, `code`, and `status` fields.
	 */
	static override isInstance(err: unknown): err is ApiError {
		return CodedError.isInstance(err, "E_API", { status: "number" });
	}

	/**
	 * Extends the base JSON with the `status` field.
	 */
	override toJSON(): Record<string, unknown> {
		const json = { ...super.toJSON(), status: this.status };
		return json;
	}
}
