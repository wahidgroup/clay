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
 * One guard's assertion and cast pair, with one input the guard accepts
 * and one input it rejects.
 */
export interface AssertionCase {
	readonly name: string;
	readonly assert: (value: unknown, message?: string) => void;
	readonly cast: (value: unknown, message?: string) => unknown;
	readonly accepted: unknown;
	readonly rejected: unknown;
}

/**
 * Matches the failure that every guard assertion throws.
 */
export const typeMismatch: unknown = expect.objectContaining({ kind: "E_VALIDATION", code: "TYPE_MISMATCH" });

/**
 * Runs the pass and throw contract across a table of assertion pairs.
 */
export function describeAssertions(cases: readonly AssertionCase[]): void {
	it.each(cases)("$name assert accepts a passing value", ({ assert, accepted }) => {
		expect(() => {
			assert(accepted);
		}).not.toThrow();
	});

	it.each(cases)("$name cast returns a passing value", ({ cast, accepted }) => {
		expect(cast(accepted)).toBe(accepted);
	});

	it.each(cases)("$name assert throws TYPE_MISMATCH for a failing value", ({ assert, rejected }) => {
		expect(() => {
			assert(rejected);
		}).toThrow(typeMismatch);
	});

	it.each(cases)("$name cast throws TYPE_MISMATCH for a failing value", ({ cast, rejected }) => {
		expect(() => cast(rejected)).toThrow(typeMismatch);
	});
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
