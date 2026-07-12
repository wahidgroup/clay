/**
 * Utility for extracting human-readable messages from unknown
 * thrown values.
 */

/**
 * Extracts a human-readable message from any thrown value.
 *
 * Prefers `Error.message` when available, falling back to
 * `String()` coercion.
 */
export function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	const message = String(error);
	return message;
}
