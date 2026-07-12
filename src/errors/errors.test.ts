import { describe, expect, it } from "vitest";

import type { ValidationIssue } from "./validation-issue.js";
import { ApiError } from "./api-error.js";
import { CodedError } from "./coded-error.js";
import { InternalError } from "./internal-error.js";
import { InvariantError } from "./invariant-error.js";
import { UserError } from "./user-error.js";
import { UserValidationError } from "./user-validation-error.js";
import { ValidationError } from "./validation-error.js";
import { errorMessage } from "./message.js";

// ---------------------------------------------------------------------------
// CodedError base behavior (tested via concrete subclasses)
// ---------------------------------------------------------------------------

describe("CodedError", () => {
	it("sets name to the constructor name", () => {
		const err = new UserError("TEST", "msg");
		expect(err.name).toBe("UserError");
	});

	it("produces a qualifiedCode from kind + code", () => {
		const err = new UserError("VALIDATION_FAILED", "bad input");
		expect(err.qualifiedCode).toBe("E_USER_VALIDATION_FAILED");
	});

	it("chains cause via native ES2022 mechanism", () => {
		const cause = new Error("root cause");
		const err = new InternalError("DB_FAIL", "query failed", cause);
		expect(err.cause).toBe(cause);
	});

	it("has undefined cause when none is provided", () => {
		const err = new UserError("X", "msg");
		expect(err.cause).toBeUndefined();
	});

	it("is an instance of Error", () => {
		const err = new UserError("X", "msg");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(CodedError);
	});
});

// ---------------------------------------------------------------------------
// toJSON
// ---------------------------------------------------------------------------

describe("toJSON", () => {
	it("serializes base fields", () => {
		const err = new UserError("INVALID_NAME", "Name is required");
		const json = err.toJSON();
		expect(json).toEqual({
			name: "UserError",
			kind: "E_USER",
			code: "INVALID_NAME",
			qualifiedCode: "E_USER_INVALID_NAME",
			message: "Name is required",
			cause: undefined,
		});
	});

	it("includes cause when present", () => {
		const cause = new Error("root");
		const err = new InternalError("FAIL", "msg", cause);
		const json = err.toJSON();
		expect(json.cause).toEqual({
			name: "Error",
			message: "root",
		});
	});

	it("serializes nested CodedError cause via toJSON", () => {
		const cause = new UserError("ROOT", "root message");
		const err = new InternalError("FAIL", "msg", cause);
		const json = err.toJSON();
		expect(json.cause).toEqual(cause.toJSON());
	});

	it("ApiError includes status in JSON", () => {
		const err = new ApiError("NOT_FOUND", 404, "Not found");
		const json = err.toJSON();
		expect(json.status).toBe(404);
		expect(json.kind).toBe("E_API");
	});

	it("round-trips through JSON.stringify", () => {
		const err = new UserError("X", "msg");
		const parsed: unknown = JSON.parse(JSON.stringify(err));
		expect(parsed).toEqual(
			expect.objectContaining({
				name: "UserError",
				kind: "E_USER",
				code: "X",
			}),
		);
	});
});

// ---------------------------------------------------------------------------
// isInstance — duck-type guards
// ---------------------------------------------------------------------------

describe("isInstance", () => {
	interface ErrorCase {
		name: string;
		err: unknown;
		user: boolean;
		api: boolean;
		internal: boolean;
		invariant: boolean;
		validation: boolean;
		userValidation: boolean;
	}

	const cases: ErrorCase[] = [
		{
			name: "UserError",
			err: new UserError("X", "msg"),
			user: true,
			api: false,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "ApiError",
			err: new ApiError("Y", 500, "msg"),
			user: false,
			api: true,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "InternalError",
			err: new InternalError("Z", "msg"),
			user: false,
			api: false,
			internal: true,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "InvariantError",
			err: new InvariantError("W", "msg"),
			user: false,
			api: false,
			internal: false,
			invariant: true,
			validation: false,
			userValidation: false,
		},
		{
			name: "ValidationError",
			err: new ValidationError("SHAPE", [{ path: "x", message: "bad" }]),
			user: false,
			api: false,
			internal: false,
			invariant: false,
			validation: true,
			userValidation: false,
		},
		{
			name: "UserValidationError",
			err: new UserValidationError("INPUT", [
				{ path: "x", message: "bad" },
			]),
			user: true,
			api: false,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: true,
		},
		{
			name: "plain Error",
			err: new Error("plain"),
			user: false,
			api: false,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "string",
			err: "not an error",
			user: false,
			api: false,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "null",
			err: null,
			user: false,
			api: false,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "duck-typed UserError-like object",
			err: { kind: "E_USER", code: "DUCK", message: "quack" },
			user: true,
			api: false,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "duck-typed ApiError-like object (missing status)",
			err: { kind: "E_API", code: "DUCK", message: "quack" },
			user: false,
			api: false,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "duck-typed ApiError-like object (with status)",
			err: { kind: "E_API", code: "DUCK", message: "quack", status: 503 },
			user: false,
			api: true,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: false,
		},
		{
			name: "duck-typed ValidationError-like object",
			err: {
				kind: "E_VALIDATION",
				code: "X",
				message: "m",
				issues: [{ path: "a", message: "b" }],
			},
			user: false,
			api: false,
			internal: false,
			invariant: false,
			validation: true,
			userValidation: false,
		},
		{
			name: "duck-typed UserValidation-like object",
			err: {
				kind: "E_USER",
				code: "X",
				message: "m",
				issues: [{ path: "a", message: "b" }],
			},
			user: true,
			api: false,
			internal: false,
			invariant: false,
			validation: false,
			userValidation: true,
		},
	];

	it.each(cases)(
		"$name: user=$user, api=$api, internal=$internal, invariant=$invariant, validation=$validation, userValidation=$userValidation",
		({
			err,
			user,
			api,
			internal,
			invariant,
			validation,
			userValidation,
		}) => {
			expect(UserError.isInstance(err)).toBe(user);
			expect(ApiError.isInstance(err)).toBe(api);
			expect(InternalError.isInstance(err)).toBe(internal);
			expect(InvariantError.isInstance(err)).toBe(invariant);
			expect(ValidationError.isInstance(err)).toBe(validation);
			expect(UserValidationError.isInstance(err)).toBe(userValidation);
		},
	);
});

// ---------------------------------------------------------------------------
// Consumer extensibility
// ---------------------------------------------------------------------------

describe("consumer extensibility", () => {
	const ENTRY_CODES = ["INVALID_NAME", "INVALID_EMAIL"] as const;

	class InvalidEntryError extends UserError {
		constructor(
			code: (typeof ENTRY_CODES)[number],
			message: string,
			cause?: unknown,
		) {
			super(code, message, cause);
		}

		static override isInstance(err: unknown): err is InvalidEntryError {
			if (!UserError.isInstance(err)) {
				return false;
			}

			for (const code of ENTRY_CODES) {
				if (err.code === code) {
					return true;
				}
			}

			return false;
		}
	}

	it("subclass is recognized by parent isInstance", () => {
		const err = new InvalidEntryError("INVALID_NAME", "bad name");
		expect(UserError.isInstance(err)).toBe(true);
	});

	it("subclass isInstance rejects non-matching codes", () => {
		const err = new UserError("OTHER_CODE", "msg");
		expect(InvalidEntryError.isInstance(err)).toBe(false);
	});

	it("subclass isInstance accepts matching codes", () => {
		const err = new InvalidEntryError("INVALID_EMAIL", "bad email");
		expect(InvalidEntryError.isInstance(err)).toBe(true);
	});

	it("subclass qualifiedCode includes parent kind", () => {
		const err = new InvalidEntryError("INVALID_NAME", "bad");
		expect(err.qualifiedCode).toBe("E_USER_INVALID_NAME");
	});

	it("cross-class rejection works", () => {
		const err = new InvalidEntryError("INVALID_NAME", "bad");
		expect(InternalError.isInstance(err)).toBe(false);
		expect(ApiError.isInstance(err)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// errorMessage
// ---------------------------------------------------------------------------

describe("errorMessage", () => {
	it.each([
		{ name: "Error instance", input: new Error("boom"), expected: "boom" },
		{ name: "TypeError", input: new TypeError("type"), expected: "type" },
		{ name: "string", input: "raw string", expected: "raw string" },
		{ name: "number", input: 42, expected: "42" },
		{ name: "null", input: null, expected: "null" },
		{ name: "undefined", input: undefined, expected: "undefined" },
		{ name: "object", input: { toString: () => "obj" }, expected: "obj" },
	])("extracts message from $name", ({ input, expected }) => {
		expect(errorMessage(input)).toBe(expected);
	});
});

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

describe("ValidationError", () => {
	const nameIssue: ValidationIssue = {
		path: "name",
		message: "Missing required field: name",
	};
	const ageIssue: ValidationIssue = {
		path: "age",
		message: "Field age must be number, got string",
	};
	const twoIssues: readonly ValidationIssue[] = [nameIssue, ageIssue];

	interface ConstructionCase {
		name: string;
		code: string;
		issues: readonly ValidationIssue[];
		message?: string;
		cause?: Error;
		expectedMessage: string;
	}

	const cases: ConstructionCase[] = [
		{
			name: "default plural message",
			code: "SHAPE_MISMATCH",
			issues: twoIssues,
			expectedMessage: "Validation failed (2 issues)",
		},
		{
			name: "default singular message",
			code: "SHAPE_MISMATCH",
			issues: [nameIssue],
			expectedMessage: "Validation failed (1 issue)",
		},
		{
			name: "custom message",
			code: "SHAPE_MISMATCH",
			issues: twoIssues,
			message: "bad payload",
			expectedMessage: "bad payload",
		},
		{
			name: "with cause",
			code: "X",
			issues: twoIssues,
			cause: new Error("root"),
			expectedMessage: "Validation failed (2 issues)",
		},
	];

	it.each(cases)(
		"$name",
		({ code, issues, message, cause, expectedMessage }) => {
			const err = new ValidationError(code, issues, message, cause);
			expect(err.message).toBe(expectedMessage);
			expect(err.kind).toBe("E_VALIDATION");
			expect(err.qualifiedCode).toBe(`E_VALIDATION_${code}`);
			expect(err.issues).toEqual(issues);
			expect(err.cause).toBe(cause);
			expect(err).toBeInstanceOf(CodedError);
			expect(err).toBeInstanceOf(Error);
		},
	);

	it("toJSON includes issues and round-trips", () => {
		const err = new ValidationError("SHAPE_MISMATCH", twoIssues);
		const json = err.toJSON();
		const expected = {
			kind: "E_VALIDATION",
			code: "SHAPE_MISMATCH",
			issues: twoIssues,
		};

		expect(json).toEqual(expect.objectContaining(expected));

		const parsed: unknown = JSON.parse(JSON.stringify(err));
		expect(parsed).toEqual(expect.objectContaining(expected));
	});
});

// ---------------------------------------------------------------------------
// UserValidationError
// ---------------------------------------------------------------------------

describe("UserValidationError", () => {
	const emailIssue: ValidationIssue = {
		path: "email",
		message: "Field email must be string, got number",
	};
	const passwordIssue: ValidationIssue = {
		path: "password",
		message: "Field password must be one of [strong, weak], got s3cr3t",
	};
	const baseIssues: readonly ValidationIssue[] = [emailIssue, passwordIssue];

	describe("construction and redaction", () => {
		interface ConstructionCase {
			name: string;
			issues: readonly ValidationIssue[];
			sensitive?: readonly string[];
			message?: string;
			expectedMessage: string;
			expectedIssueMessages: string[];
		}

		const cases: ConstructionCase[] = [
			{
				name: "single issue — singular default message",
				issues: [emailIssue],
				expectedMessage: "Validation failed (1 issue)",
				expectedIssueMessages: [
					"Field email must be string, got number",
				],
			},
			{
				name: "multiple issues — plural default message",
				issues: baseIssues,
				expectedMessage: "Validation failed (2 issues)",
				expectedIssueMessages: [
					"Field email must be string, got number",
					"Field password must be one of [strong, weak], got s3cr3t",
				],
			},
			{
				name: "custom message without sensitive values",
				issues: baseIssues,
				message: "Invalid user input",
				expectedMessage: "Invalid user input",
				expectedIssueMessages: [
					"Field email must be string, got number",
					"Field password must be one of [strong, weak], got s3cr3t",
				],
			},
			{
				name: "redacts sensitive value from issue messages",
				issues: baseIssues,
				sensitive: ["s3cr3t"],
				expectedMessage: "Validation failed (2 issues)",
				expectedIssueMessages: [
					"Field email must be string, got number",
					"Field password must be one of [strong, weak], got ****",
				],
			},
			{
				name: "redacts sensitive value from custom message",
				issues: baseIssues,
				sensitive: ["s3cr3t"],
				message: "Failed for s3cr3t",
				expectedMessage: "Failed for ****",
				expectedIssueMessages: [
					"Field email must be string, got number",
					"Field password must be one of [strong, weak], got ****",
				],
			},
			{
				name: "redacts multiple sensitive values",
				issues: [
					{ path: "auth", message: "got token123 and secret456" },
				],
				sensitive: ["token123", "secret456"],
				expectedMessage: "Validation failed (1 issue)",
				expectedIssueMessages: ["got **** and ****"],
			},
			{
				name: "redacts repeated occurrences in one message",
				issues: [{ path: "x", message: "abc abc abc" }],
				sensitive: ["abc"],
				expectedMessage: "Validation failed (1 issue)",
				expectedIssueMessages: ["**** **** ****"],
			},
			{
				name: "empty sensitive array does not redact",
				issues: baseIssues,
				sensitive: [],
				expectedMessage: "Validation failed (2 issues)",
				expectedIssueMessages: [
					"Field email must be string, got number",
					"Field password must be one of [strong, weak], got s3cr3t",
				],
			},
		];

		it.each(cases)(
			"$name",
			({
				issues,
				sensitive,
				message,
				expectedMessage,
				expectedIssueMessages,
			}) => {
				const err = new UserValidationError(
					"INPUT",
					issues,
					sensitive,
					message,
				);
				expect(err.message).toBe(expectedMessage);

				const messages = err.issues.map((i) => i.message);
				expect(messages).toEqual(expectedIssueMessages);
			},
		);

		it("redacts sensitive strings from issue value fields", () => {
			const err = new UserValidationError(
				"INPUT",
				[
					{
						path: "token",
						message: "bad token",
						code: "type",
						value: "s3cr3t",
					},
				],
				["s3cr3t"],
			);
			expect(err.issues).toEqual([
				{
					path: "token",
					message: "bad token",
					code: "type",
					value: "****",
				},
			]);
		});
	});

	describe("properties", () => {
		it("has kind E_USER and qualifiedCode E_USER_INPUT", () => {
			const err = new UserValidationError("INPUT", baseIssues);
			expect(err.kind).toBe("E_USER");
			expect(err.code).toBe("INPUT");
			expect(err.qualifiedCode).toBe("E_USER_INPUT");
		});

		it("is an instance of UserError, CodedError, and Error", () => {
			const err = new UserValidationError("INPUT", baseIssues);
			expect(err).toBeInstanceOf(UserError);
			expect(err).toBeInstanceOf(CodedError);
			expect(err).toBeInstanceOf(Error);
		});

		it("chains cause", () => {
			const cause = new Error("root");
			const err = new UserValidationError(
				"INPUT",
				baseIssues,
				undefined,
				undefined,
				cause,
			);
			expect(err.cause).toBe(cause);
		});
	});

	describe("isInstance", () => {
		interface GuardCase {
			name: string;
			err: unknown;
			expected: boolean;
		}

		const cases: GuardCase[] = [
			{
				name: "UserValidationError instance",
				err: new UserValidationError("INPUT", [
					{ path: "x", message: "y" },
				]),
				expected: true,
			},
			{
				name: "plain UserError (no issues)",
				err: new UserError("X", "msg"),
				expected: false,
			},
			{
				name: "ValidationError (different kind)",
				err: new ValidationError("X", [{ path: "x", message: "y" }]),
				expected: false,
			},
			{
				name: "duck-typed with issues",
				err: {
					kind: "E_USER",
					code: "DUCK",
					message: "msg",
					issues: [{ path: "x", message: "y" }],
				},
				expected: true,
			},
			{
				name: "duck-typed without issues",
				err: { kind: "E_USER", code: "DUCK", message: "msg" },
				expected: false,
			},
			{
				name: "null",
				err: null,
				expected: false,
			},
		];

		it.each(cases)("$name → $expected", ({ err, expected }) => {
			expect(UserValidationError.isInstance(err)).toBe(expected);
		});

		it("passes parent UserError.isInstance", () => {
			const err = new UserValidationError("INPUT", [
				{ path: "x", message: "y" },
			]);
			expect(UserError.isInstance(err)).toBe(true);
		});
	});

	describe("toJSON", () => {
		it("includes redacted issues in serialized output", () => {
			const issues: ValidationIssue[] = [
				{ path: "pw", message: "got secret123" },
			];

			const err = new UserValidationError("INPUT", issues, ["secret123"]);
			const json = err.toJSON();
			expect(json.issues).toEqual([{ path: "pw", message: "got ****" }]);
			expect(json.kind).toBe("E_USER");
			expect(json.code).toBe("INPUT");
			expect(json.message).toBe("Validation failed (1 issue)");
		});

		it("round-trips through JSON.stringify with redaction intact", () => {
			const issues: ValidationIssue[] = [
				{ path: "token", message: "bad value abc123" },
			];

			const err = new UserValidationError("AUTH", issues, ["abc123"]);
			const parsed: unknown = JSON.parse(JSON.stringify(err));
			expect(parsed).toEqual(
				expect.objectContaining({
					kind: "E_USER",
					code: "AUTH",
					issues: [{ path: "token", message: "bad value ****" }],
				}),
			);
		});
	});
});
