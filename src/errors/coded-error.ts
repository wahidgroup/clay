/**
 * Abstract base for all standardized errors.
 *
 * Provides a two-level discriminant (`kind` + `code`), duck-type
 * identification via `isInstance`, and structured JSON serialization.
 */

import type { FieldDef } from "../shape.js";
import { isShape } from "../shape.js";

/**
 * Serializes an error cause for JSON without relying on bare
 * `Error` stringification (which yields `{}`).
 */
function serializeCause(cause: unknown): unknown {
	if (!(cause instanceof Error)) {
		return cause;
	}
	if (cause instanceof CodedError) {
		return cause.toJSON();
	}

	return {
		name: cause.name,
		message: cause.message,
	};
}

/**
 * Abstract base class for errors with a two-level discriminant.
 *
 * - `kind` — category prefix (e.g., `"E_USER"`, `"E_API"`)
 * - `code` — specific identifier freely defined by consumers
 *
 * Together they form a fully qualified code via the `qualifiedCode`
 * getter (e.g., `"E_USER_INVALID_NAME"`).
 */
export abstract class CodedError extends Error {
	/**
	 * Category prefix for this error class.
	 */
	abstract readonly kind: string;

	/**
	 * Specific error identifier defined by the consumer.
	 */
	abstract readonly code: string;

	constructor(message: string, cause?: unknown) {
		super(message, { cause });
		this.name = this.constructor.name;
	}

	/**
	 * Fully qualified error code combining `kind` and `code`.
	 */
	get qualifiedCode(): string {
		const qualified = `${this.kind}_${this.code}`;
		return qualified;
	}

	/**
	 * Structured JSON representation for serialization.
	 */
	toJSON(): Record<string, unknown> {
		const json: Record<string, unknown> = {
			name: this.name,
			kind: this.kind,
			code: this.code,
			qualifiedCode: this.qualifiedCode,
			message: this.message,
			cause: serializeCause(this.cause),
		};
		return json;
	}

	/**
	 * Duck-type validation helper for subclass `isInstance` guards.
	 *
	 * Checks for `kind` and `code` string fields, optionally validates
	 * additional fields via `spec`, then confirms the `kind` value matches.
	 */
	static isInstance(
		err: unknown,
		kind: string,
		spec?: Record<string, FieldDef>,
	): boolean {
		const baseSpec: Record<string, FieldDef> = {
			kind: "string",
			code: "string",
			message: "string",
			...spec,
		};

		if (!isShape(err, baseSpec)) {
			return false;
		}

		const errKind: unknown = Reflect.get(err, "kind");
		return errKind === kind;
	}
}
