/**
 * Guard assertion and cast tests.
 */

import { describe, expect, it } from "vitest";

import { ValidationError } from "./errors/validation-error.js";
import {
	asArray,
	asArrayOf,
	asBoolean,
	asDefined,
	asError,
	asFiniteNumber,
	asNonEmptyString,
	asNonNull,
	asNumber,
	asOneOf,
	asPlainRecord,
	asProperties,
	asRecord,
	asString,
	asSystemError,
	assertArray,
	assertArrayOf,
	assertBoolean,
	assertDefined,
	assertError,
	assertFiniteNumber,
	assertNonEmptyString,
	assertNonNull,
	assertNumber,
	assertOneOf,
	assertPlainRecord,
	assertProperties,
	assertRecord,
	assertString,
	assertSystemError,
} from "./assertions.js";
import { isString } from "./guards.js";
import { describeAssertions } from "./testing/guard.harness.js";

const statuses = ["active", "inactive"] as const;

const notFound = Object.assign(new Error("not found"), { code: "ENOENT" });

const denied = Object.assign(new Error("denied"), { code: "EACCES" });

/**
 * Captures the error a call throws, or `undefined` when it returns.
 */
function thrownBy(call: () => unknown): unknown {
	try {
		call();
	} catch (err) {
		return err;
	}

	return undefined;
}

describe("guard assertions", () => {
	describeAssertions([
		{ name: "string", assert: assertString, cast: asString, accepted: "a", rejected: 1 },
		{ name: "number", assert: assertNumber, cast: asNumber, accepted: 1, rejected: "1" },
		{
			name: "finite number",
			assert: assertFiniteNumber,
			cast: asFiniteNumber,
			accepted: 1,
			rejected: Number.NaN,
		},
		{
			name: "non-empty string",
			assert: assertNonEmptyString,
			cast: asNonEmptyString,
			accepted: "a",
			rejected: "",
		},
		{ name: "boolean", assert: assertBoolean, cast: asBoolean, accepted: false, rejected: 0 },
		{ name: "non-null", assert: assertNonNull, cast: asNonNull, accepted: 0, rejected: null },
		{ name: "defined", assert: assertDefined, cast: asDefined, accepted: null, rejected: undefined },
		{ name: "array", assert: assertArray, cast: asArray, accepted: [], rejected: {} },
		{
			name: "array of strings",
			assert: (value, message) => {
				assertArrayOf(value, isString, message);
			},
			cast: (value, message) => asArrayOf(value, isString, message),
			accepted: ["a"],
			rejected: ["a", 1],
		},
		{ name: "Error", assert: assertError, cast: asError, accepted: notFound, rejected: { message: "e" } },
		{ name: "record", assert: assertRecord, cast: asRecord, accepted: new Date(), rejected: [] },
		{
			name: "plain record",
			assert: assertPlainRecord,
			cast: asPlainRecord,
			accepted: { a: 1 },
			rejected: new Date(),
		},
		{
			name: "properties",
			assert: (value, message) => {
				assertProperties(value, ["id"], message);
			},
			cast: (value, message) => asProperties(value, ["id"], message),
			accepted: { id: 1 },
			rejected: { name: "a" },
		},
		{
			name: "one of",
			assert: (value, message) => {
				assertOneOf(value, statuses, message);
			},
			cast: (value, message) => asOneOf(value, statuses, message),
			accepted: "active",
			rejected: "deleted",
		},
		{
			name: "system error",
			assert: (value, message) => {
				assertSystemError(value, "ENOENT", message);
			},
			cast: (value, message) => asSystemError(value, "ENOENT", message),
			accepted: notFound,
			rejected: denied,
		},
	]);

	it("throws a ValidationError with one root type issue", () => {
		const err = thrownBy(() => asString(1));
		expect(ValidationError.isInstance(err)).toBe(true);
		expect(err).toMatchObject({ issues: [{ path: "", code: "type", expected: "string" }] });
	});

	it("uses the caller message when one is given", () => {
		const call = (): string => asString(1, "name must be text");
		expect(call).toThrow("name must be text");
	});

	it("keeps a rejected Error as the cause", () => {
		const err = thrownBy(() => asSystemError(denied, "ENOENT"));
		expect(err).toMatchObject({ cause: denied });
	});

	it("leaves the cause empty for a rejected non-Error", () => {
		const err = thrownBy(() => asString(1));
		expect(err).toMatchObject({ cause: undefined });
	});

	it("narrows a system error to its literal code", () => {
		const err: unknown = notFound;
		assertSystemError(err, "ENOENT");

		const code: "ENOENT" = err.code;
		expect(code).toBe("ENOENT");
	});
});
