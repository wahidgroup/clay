import { describe, expect, it } from "vitest";

import {
	assertNever,
	hasProperties,
	isArray,
	isBoolean,
	isDefined,
	isError,
	isNonNull,
	isNumber,
	isOneOf,
	isRecord,
	isString,
	isSystemError,
} from "./guards.js";
import { describeBooleanGuard } from "./testing/guard.harness.js";

describe("isRecord", () => {
	const nullProto: Record<string, unknown> = {};
	Object.setPrototypeOf(nullProto, null);

	it.each([
		{ name: "plain object", value: {}, expected: true },
		{ name: "object with keys", value: { a: 1 }, expected: true },
		{ name: "null-prototype object", value: nullProto, expected: true },
		{ name: "null", value: null, expected: false },
		{ name: "undefined", value: undefined, expected: false },
		{ name: "string", value: "hello", expected: false },
		{ name: "number", value: 42, expected: false },
		{ name: "boolean", value: true, expected: false },
		{ name: "array", value: [1, 2, 3], expected: false },
		{ name: "empty array", value: [], expected: false },
	])("returns $expected for $name", ({ value, expected }) => {
		expect(isRecord(value)).toBe(expected);
	});
});

describe("hasProperties", () => {
	it.each([
		{
			name: "all keys present",
			value: { a: 1, b: 2 },
			keys: ["a", "b"],
			expected: true,
		},
		{
			name: "extra keys allowed",
			value: { a: 1, b: 2, c: 3 },
			keys: ["a"],
			expected: true,
		},
		{
			name: "missing key",
			value: { a: 1 },
			keys: ["a", "b"],
			expected: false,
		},
		{ name: "null", value: null, keys: ["a"], expected: false },
		{ name: "string", value: "str", keys: ["length"], expected: false },
	])("returns $expected for $name", ({ value, keys, expected }) => {
		expect(hasProperties(value, ...keys)).toBe(expected);
	});

	it("ignores prototype-inherited keys", () => {
		const proto = { email: "x@y.z" };
		const value: unknown = Object.create(proto);
		expect(hasProperties(value, "email")).toBe(false);
	});
});

describeBooleanGuard("isString", isString, [
	{ name: "empty string", value: "", expected: true },
	{ name: "non-empty string", value: "hello", expected: true },
	{ name: "number", value: 42, expected: false },
	{ name: "null", value: null, expected: false },
	{ name: "undefined", value: undefined, expected: false },
]);

describeBooleanGuard("isNumber", isNumber, [
	{ name: "zero", value: 0, expected: true },
	{ name: "NaN", value: Number.NaN, expected: true },
	{ name: "Infinity", value: Number.POSITIVE_INFINITY, expected: true },
	{ name: "numeric string", value: "42", expected: false },
	{ name: "null", value: null, expected: false },
]);

describeBooleanGuard("isBoolean", isBoolean, [
	{ name: "true", value: true, expected: true },
	{ name: "false", value: false, expected: true },
	{ name: "zero", value: 0, expected: false },
	{ name: "empty string", value: "", expected: false },
	{ name: "null", value: null, expected: false },
]);

describeBooleanGuard("isNonNull", isNonNull, [
	{ name: "string", value: "hello", expected: true },
	{ name: "zero", value: 0, expected: true },
	{ name: "empty string", value: "", expected: true },
	{ name: "false", value: false, expected: true },
	{ name: "null", value: null, expected: false },
	{ name: "undefined", value: undefined, expected: false },
]);

describeBooleanGuard("isDefined", isDefined, [
	{ name: "string", value: "hello", expected: true },
	{ name: "null", value: null, expected: true },
	{ name: "zero", value: 0, expected: true },
	{ name: "false", value: false, expected: true },
	{ name: "undefined", value: undefined, expected: false },
]);

describeBooleanGuard("isArray", isArray, [
	{ name: "empty array", value: [], expected: true },
	{ name: "filled array", value: [1, 2], expected: true },
	{ name: "object", value: {}, expected: false },
	{ name: "string", value: "abc", expected: false },
	{ name: "null", value: null, expected: false },
]);

describeBooleanGuard("isError", isError, [
	{ name: "Error", value: new Error("e"), expected: true },
	{ name: "TypeError", value: new TypeError("t"), expected: true },
	{ name: "string", value: "error", expected: false },
	{ name: "object", value: { message: "e" }, expected: false },
	{ name: "null", value: null, expected: false },
]);

describe("isOneOf", () => {
	const statuses = ["active", "inactive", "pending"] as const;
	const codes = [200, 404, 500] as const;
	const flags = [true] as const;

	it.each([
		{ name: "matching string literal", value: "active", expected: true },
		{ name: "non-matching string", value: "deleted", expected: false },
		{ name: "null against string set", value: null, expected: false },
		{ name: "number against string set", value: 42, expected: false },
	])("returns $expected for $name", ({ value, expected }) => {
		expect(isOneOf(value, statuses)).toBe(expected);
	});

	it.each([
		{ name: "matching number literal", value: 200, expected: true },
		{ name: "non-matching number", value: 403, expected: false },
	])("returns $expected for $name", ({ value, expected }) => {
		expect(isOneOf(value, codes)).toBe(expected);
	});

	it.each([
		{ name: "matching boolean literal", value: true, expected: true },
		{ name: "non-matching boolean", value: false, expected: false },
	])("returns $expected for $name", ({ value, expected }) => {
		expect(isOneOf(value, flags)).toBe(expected);
	});
});

describe("isSystemError", () => {
	it.each([
		{
			name: "Error with matching code",
			value: Object.assign(new Error("not found"), { code: "ENOENT" }),
			code: "ENOENT",
			expected: true,
		},
		{
			name: "Error with non-matching code",
			value: Object.assign(new Error("denied"), { code: "EACCES" }),
			code: "ENOENT",
			expected: false,
		},
		{
			name: "plain Error without code",
			value: new Error("plain"),
			code: "ENOENT",
			expected: false,
		},
		{
			name: "plain object with code",
			value: { code: "ENOENT" },
			code: "ENOENT",
			expected: false,
		},
		{
			name: "string",
			value: "ENOENT",
			code: "ENOENT",
			expected: false,
		},
		{
			name: "null",
			value: null,
			code: "ENOENT",
			expected: false,
		},
	])("returns $expected for $name", ({ value, code, expected }) => {
		expect(isSystemError(value, code)).toBe(expected);
	});
});

describe("assertNever", () => {
	const invoke = assertNever;

	it("throws a TypeError at runtime", () => {
		// @ts-expect-error - testing runtime guard requires a non-never value
		expect(() => invoke("oops")).toThrow(TypeError);
	});

	it("includes the unexpected value in the message", () => {
		// @ts-expect-error - testing runtime guard requires a non-never value
		expect(() => invoke(42)).toThrow("Unexpected value: 42");
	});
});
