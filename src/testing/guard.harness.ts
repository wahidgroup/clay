/**
 * Data-driven harness for unary boolean type guards.
 */

import { describe, expect, it } from "vitest";

/**
 * One input/output row for a unary boolean guard.
 */
export interface BooleanGuardCase {
	readonly name: string;
	readonly value: unknown;
	readonly expected: boolean;
}

/**
 * Runs the same boolean assertion across a table of inputs.
 */
export function describeBooleanGuard(
	name: string,
	guard: (value: unknown) => boolean,
	cases: readonly BooleanGuardCase[],
): void {
	describe(name, () => {
		it.each(cases)("returns $expected for $name", ({ value, expected }) => {
			expect(guard(value)).toBe(expected);
		});
	});
}
