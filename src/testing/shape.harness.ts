/**
 * Shared assertions for shape validation results.
 */

import { expect } from "vitest";

import type { ValidationIssue } from "../errors/validation-issue.js";
import type { ShapeResult } from "../shape.js";

/**
 * Asserts issue paths match (same length, each expected path present).
 */
export function expectIssuePaths(issues: readonly ValidationIssue[], paths: readonly string[]): void {
	expect(issues).toHaveLength(paths.length);

	const actual = issues.map((issue) => issue.path);
	for (const path of paths) {
		expect(actual).toContain(path);
	}
}

/**
 * Asserts issue codes each appear at least once.
 */
export function expectIssueCodes(issues: readonly ValidationIssue[], codes: readonly string[]): void {
	const actual = issues.map((issue) => issue.code);
	for (const code of codes) {
		expect(actual).toContain(code);
	}
}

/**
 * Asserts a failed {@link ShapeResult} reports the given issue paths.
 */
export function expectFailurePaths(result: ShapeResult<unknown>, paths: readonly string[]): void {
	expect(result.ok).toBe(false);

	if (result.ok) {
		return;
	}

	expectIssuePaths(result.issues, paths);
}
