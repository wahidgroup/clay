/**
 * Assertion / createShape factory tests.
 */

import { describe, expect, it } from "vitest";

import { ValidationError } from "./errors/validation-error.js";
import { createShape, createStrictShape } from "./shape-assert.js";
import { expectFailurePaths } from "./testing/shape.harness.js";

describe("createShape", () => {
	const user = createShape({
		name: "string",
		age: { type: "number", optional: true },
	} as const);

	it("exposes frozen fields and soft strict flag", () => {
		expect(user.strict).toBe(false);
		expect(Object.isFrozen(user.fields)).toBe(true);
	});

	it("is / try / as succeed for valid values", () => {
		const value = { name: "Ada", age: 36 };
		expect(user.is(value)).toBe(true);

		const result = user.try(value);
		expect(result).toEqual({ ok: true, value });
		expect(user.as(value).name).toBe("Ada");
	});

	it("try fails with issues for invalid values", () => {
		expectFailurePaths(user.try({ name: 1 }), ["name"]);
	});

	it("assert throws ValidationError with custom message", () => {
		expect(() => {
			user.assert({ name: 1 }, "bad user");
		}).toThrow(ValidationError);
		expect(() => {
			user.assert({ name: 1 }, "bad user");
		}).toThrow("bad user");
	});
});

describe("createStrictShape", () => {
	const strictUser = createStrictShape({
		name: "string",
	} as const);

	it("exposes strict flag", () => {
		expect(strictUser.strict).toBe(true);
	});

	it("rejects extra fields via is / try / assert / as", () => {
		const value = { name: "Ada", extra: true };
		expect(strictUser.is(value)).toBe(false);
		expectFailurePaths(strictUser.try(value), ["extra"]);

		expect(() => {
			strictUser.assert(value);
		}).toThrow(ValidationError);

		expect(() => {
			strictUser.as(value);
		}).toThrow(ValidationError);
	});

	it("accepts exact fields", () => {
		expect(strictUser.is({ name: "Ada" })).toBe(true);
		expect(strictUser.as({ name: "Ada" }).name).toBe("Ada");
	});
});
