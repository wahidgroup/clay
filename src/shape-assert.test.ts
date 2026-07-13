/**
 * Assertion / createShape factory tests.
 */

import { describe, expect, it } from "vitest";

import { ValidationError } from "./errors/validation-error.js";
import {
	asShape,
	assertShape,
	createShape,
	createStrictShape,
} from "./shape-assert.js";

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
		expect(result.ok).toBe(true);
		expect(user.as(value).name).toBe("Ada");
	});

	it("try fails with issues for invalid values", () => {
		const result = user.try({ name: 1 });
		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("expected failure");
		}

		expect(result.issues.map((issue) => issue.path)).toContain("name");
	});

	it("assert throws ValidationError with custom message", () => {
		expect(() => {
			user.assert({ name: 1 }, "bad user");
		}).toThrow(ValidationError);

		try {
			user.assert({ name: 1 }, "bad user");
		} catch (err) {
			expect(ValidationError.isInstance(err)).toBe(true);
			if (ValidationError.isInstance(err)) {
				expect(err.message).toBe("bad user");
			}
		}
	});

	it("asShape helper molds valid values", () => {
		expect(asShape({ id: 1 }, { id: "number" }).id).toBe(1);
	});

	it("assertShape throws on invalid values", () => {
		expect(() => {
			assertShape({ id: "x" }, { id: "number" });
		}).toThrow(ValidationError);
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

		const result = strictUser.try(value);
		expect(result.ok).toBe(false);

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
