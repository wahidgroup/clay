import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import type { FieldDef, ShapeResult } from "./shape.js";
import { ValidationError } from "./errors/validation-error.js";
import { isShape, tryShape, tryStrictShape, validateObject } from "./shape.js";
import {
	asShape,
	asStrictShape,
	assertShape,
	assertStrictShape,
} from "./shape-assert.js";

/**
 * Asserts a failed {@link ShapeResult} reports the given issue paths.
 */
function expectFailurePaths(
	result: ShapeResult<unknown>,
	paths: readonly string[],
): void {
	expect(result.ok).toBe(false);

	if (result.ok) {
		throw new Error("expected failure result");
	}

	const actual = result.issues.map((issue) => issue.path);
	for (const path of paths) {
		expect(actual).toContain(path);
	}
}

// ---------------------------------------------------------------------------
// isShape - predicate guard
// ---------------------------------------------------------------------------

describe("isShape", () => {
	describe("primitive fields", () => {
		const spec = { name: "string", age: "number" } as const;

		const truthy = [
			{ name: "matching object", value: { name: "Alice", age: 30 } },
			{
				name: "extra fields allowed",
				value: { name: "Bob", age: 25, extra: true },
			},
		];

		it.each(truthy)("returns true for $name", ({ value }) => {
			expect(isShape(value, spec)).toBe(true);
		});

		const falsy = [
			{ name: "null", value: null },
			{ name: "undefined", value: undefined },
			{ name: "string", value: "hello" },
			{ name: "array", value: [1, 2] },
			{ name: "missing field", value: { name: "Alice" } },
			{ name: "wrong type", value: { name: 123, age: 30 } },
		];

		it.each(falsy)("returns false for $name", ({ value }) => {
			expect(isShape(value, spec)).toBe(false);
		});
	});

	describe("optional fields", () => {
		const spec = {
			name: "string",
			age: { type: "number", optional: true },
		} as const;

		it("returns true when optional field is absent", () => {
			expect(isShape({ name: "Alice" }, spec)).toBe(true);
		});

		it("returns true when optional field is present and correct", () => {
			expect(isShape({ name: "Alice", age: 30 }, spec)).toBe(true);
		});

		it("returns false when optional field has wrong type", () => {
			expect(isShape({ name: "Alice", age: "thirty" }, spec)).toBe(false);
		});

		it("returns false when optional field is null without nullable", () => {
			expect(isShape({ name: "Alice", age: null }, spec)).toBe(false);
		});
	});

	describe("nullable fields", () => {
		const requiredNullable = {
			name: "string",
			nickname: { type: "string", nullable: true },
		} as const;

		const optionalNullable = {
			name: "string",
			nickname: { type: "string", optional: true, nullable: true },
		} as const;

		it("returns true when nullable field is null", () => {
			expect(
				isShape({ name: "Alice", nickname: null }, requiredNullable),
			).toBe(true);
		});

		it("returns true when nullable field has a matching value", () => {
			expect(
				isShape({ name: "Alice", nickname: "Al" }, requiredNullable),
			).toBe(true);
		});

		it("returns false when required nullable field is absent", () => {
			expect(isShape({ name: "Alice" }, requiredNullable)).toBe(false);
		});

		it("returns false when non-nullable field is null", () => {
			expect(isShape({ name: null }, { name: "string" })).toBe(false);
		});

		it("returns true when optional nullable field is absent", () => {
			expect(isShape({ name: "Alice" }, optionalNullable)).toBe(true);
		});

		it("returns true when optional nullable field is null", () => {
			expect(
				isShape({ name: "Alice", nickname: null }, optionalNullable),
			).toBe(true);
		});

		it("accepts null for nullable arrays and objects", () => {
			const spec = {
				tags: { type: "array", items: "string", nullable: true },
				meta: {
					type: "object",
					shape: { key: "string" },
					nullable: true,
				},
			} as const;
			expect(isShape({ tags: null, meta: null }, spec)).toBe(true);
			expect(isShape({ tags: ["a"], meta: { key: "v" } }, spec)).toBe(
				true,
			);
		});
	});

	describe("array fields", () => {
		const spec = {
			tags: { type: "array", items: "string" },
		} as const;

		it("returns true for valid arrays", () => {
			expect(isShape({ tags: ["a", "b"] }, spec)).toBe(true);
			expect(isShape({ tags: [] }, spec)).toBe(true);
		});

		it("returns false for non-arrays", () => {
			expect(isShape({ tags: "not-array" }, spec)).toBe(false);
		});

		it("returns false when an element has the wrong type", () => {
			expect(isShape({ tags: ["a", 42] }, spec)).toBe(false);
		});
	});

	describe("nested object fields", () => {
		const spec = {
			address: {
				type: "object",
				shape: { city: "string", zip: "string" },
			},
		} as const;

		it("returns true for valid nested objects", () => {
			expect(
				isShape({ address: { city: "NYC", zip: "10001" } }, spec),
			).toBe(true);
		});

		it("returns false when nested field is missing", () => {
			expect(isShape({ address: { city: "NYC" } }, spec)).toBe(false);
		});

		it("returns false when nested field has wrong type", () => {
			expect(
				isShape({ address: { city: "NYC", zip: 10001 } }, spec),
			).toBe(false);
		});

		it("returns false when nested value is not an object", () => {
			expect(isShape({ address: "NYC" }, spec)).toBe(false);
		});
	});

	describe("literal fields", () => {
		const spec = {
			status: {
				type: "literal",
				values: ["active", "inactive"] as const,
			},
		} as const;

		it("returns true for matching literals", () => {
			expect(isShape({ status: "active" }, spec)).toBe(true);
			expect(isShape({ status: "inactive" }, spec)).toBe(true);
		});

		it("returns false for non-matching values", () => {
			expect(isShape({ status: "deleted" }, spec)).toBe(false);
			expect(isShape({ status: 42 }, spec)).toBe(false);
		});
	});

	describe("mixed spec", () => {
		const spec = {
			name: "string",
			age: { type: "number", optional: true },
			tags: { type: "array", items: "string" },
			address: { type: "object", shape: { city: "string" } },
			role: { type: "literal", values: ["admin", "user"] as const },
		} as const;

		it("returns true for a complete valid payload", () => {
			const payload = {
				name: "Alice",
				age: 30,
				tags: ["dev"],
				address: { city: "NYC" },
				role: "admin",
			};
			expect(isShape(payload, spec)).toBe(true);
		});

		it("returns true with optional field omitted", () => {
			const payload = {
				name: "Bob",
				tags: [],
				address: { city: "LA" },
				role: "user",
			};
			expect(isShape(payload, spec)).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// assertShape
// ---------------------------------------------------------------------------

describe("assertShape", () => {
	const spec = { name: "string", count: "number" } as const;

	it("does not throw for valid shapes", () => {
		expect(() => assertShape({ name: "x", count: 1 }, spec)).not.toThrow();
	});

	it("throws ValidationError for invalid shapes", () => {
		expect(() => assertShape(null, spec)).toThrow(ValidationError);
		expect(() => assertShape({ name: "x" }, spec)).toThrow(ValidationError);
	});

	it("uses custom message when provided", () => {
		expect(() => assertShape(null, spec, "bad input")).toThrow("bad input");
	});
});

// ---------------------------------------------------------------------------
// assertStrictShape
// ---------------------------------------------------------------------------

describe("assertStrictShape", () => {
	const spec = { name: "string" } as const;

	it("does not throw when only declared fields are present", () => {
		expect(() => assertStrictShape({ name: "x" }, spec)).not.toThrow();
	});

	it("throws when extra fields are present", () => {
		expect(() =>
			assertStrictShape({ name: "x", extra: true }, spec),
		).toThrow(ValidationError);
	});

	it("rejects extras recursively in nested objects", () => {
		const nested = {
			inner: { type: "object", shape: { a: "string" } },
		} as const;
		expect(() =>
			assertStrictShape({ inner: { a: "x", b: "y" } }, nested),
		).toThrow(ValidationError);
	});

	it("uses custom message when provided", () => {
		expect(() =>
			assertStrictShape({ name: "x", extra: 1 }, spec, "strict"),
		).toThrow("strict");
	});
});

// ---------------------------------------------------------------------------
// asShape / asStrictShape - inline convenience
// ---------------------------------------------------------------------------

describe("asShape", () => {
	const spec = { id: "number" } as const;

	it("returns the narrowed value on success", () => {
		const result = asShape({ id: 1, extra: true }, spec);
		expect(result.id).toBe(1);
	});

	it("throws on failure", () => {
		expect(() => asShape(null, spec)).toThrow(ValidationError);
	});
});

describe("asStrictShape", () => {
	const spec = { id: "number" } as const;

	it("returns the narrowed value when no extras", () => {
		const result = asStrictShape({ id: 1 }, spec);
		expect(result.id).toBe(1);
	});

	it("throws when extra fields are present", () => {
		expect(() => asStrictShape({ id: 1, extra: true }, spec)).toThrow(
			ValidationError,
		);
	});
});

// ---------------------------------------------------------------------------
// tryShape / tryStrictShape - non-throwing result
// ---------------------------------------------------------------------------

describe("tryShape", () => {
	const spec = { name: "string", age: "number" } as const;

	it("returns ok with the narrowed value on success", () => {
		const result = tryShape({ name: "Alice", age: 30, extra: true }, spec);
		expect(result).toEqual({
			ok: true,
			value: { name: "Alice", age: 30, extra: true },
		});
	});

	it("returns issues without throwing on failure", () => {
		const result = tryShape({ name: 1 }, spec);
		expectFailurePaths(result, ["name", "age"]);
	});
});

describe("tryStrictShape", () => {
	const spec = { name: "string" } as const;

	it("returns ok when only declared fields are present", () => {
		const result = tryStrictShape({ name: "Alice" }, spec);
		expect(result).toEqual({
			ok: true,
			value: { name: "Alice" },
		});
	});

	it("returns issues for unexpected fields", () => {
		const result = tryStrictShape({ name: "Alice", extra: true }, spec);
		expectFailurePaths(result, ["extra"]);
	});
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
	it("validates nested arrays of objects", () => {
		const spec = {
			items: {
				type: "array",
				items: { type: "object", shape: { name: "string" } },
			},
		} as const;
		expect(isShape({ items: [{ name: "a" }, { name: "b" }] }, spec)).toBe(
			true,
		);
		expect(isShape({ items: [{ name: "a" }, { wrong: "b" }] }, spec)).toBe(
			false,
		);
	});

	it("validates arrays of literal values", () => {
		const spec = {
			roles: {
				type: "array",
				items: { type: "literal", values: ["admin", "user"] as const },
			},
		} as const;
		expect(isShape({ roles: ["admin", "user"] }, spec)).toBe(true);
		expect(isShape({ roles: ["admin", "guest"] }, spec)).toBe(false);
	});

	it("handles deeply nested objects", () => {
		const spec = {
			level1: {
				type: "object",
				shape: {
					level2: {
						type: "object",
						shape: { value: "number" },
					},
				},
			},
		} as const;
		expect(isShape({ level1: { level2: { value: 42 } } }, spec)).toBe(true);
		expect(isShape({ level1: { level2: { value: "no" } } }, spec)).toBe(
			false,
		);
	});

	it("optional array field", () => {
		const spec = {
			tags: { type: "array", items: "string", optional: true },
		} as const;
		expect(isShape({}, spec)).toBe(true);
		expect(isShape({ tags: ["a"] }, spec)).toBe(true);
		expect(isShape({ tags: [42] }, spec)).toBe(false);
	});

	it("optional nested object field", () => {
		const spec = {
			meta: { type: "object", shape: { key: "string" }, optional: true },
		} as const;
		expect(isShape({}, spec)).toBe(true);
		expect(isShape({ meta: { key: "v" } }, spec)).toBe(true);
		expect(isShape({ meta: { key: 42 } }, spec)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// validateObject - issue collection
// ---------------------------------------------------------------------------

describe("validateObject", () => {
	interface ValidateCase {
		name: string;
		value: unknown;
		spec: Record<string, FieldDef>;
		strict: boolean;
		prefix?: string;
		expectedPaths: string[];
	}

	const cases: ValidateCase[] = [
		{
			name: "valid input yields no issues",
			value: { name: "Alice", age: 30 },
			spec: { name: "string", age: "number" },
			strict: false,
			expectedPaths: [],
		},
		{
			name: "collects issues from multiple wrong types",
			value: { name: 42, age: "old", active: "yes" },
			spec: { name: "string", age: "number", active: "boolean" },
			strict: false,
			expectedPaths: ["name", "age", "active"],
		},
		{
			name: "reports missing required fields",
			value: {},
			spec: { a: "string", b: "number" },
			strict: false,
			expectedPaths: ["a", "b"],
		},
		{
			name: "nested fields use dot notation",
			value: { address: { city: 42, zip: "bad" } },
			spec: {
				address: {
					type: "object",
					shape: { city: "string", zip: "number" },
				},
			},
			strict: false,
			expectedPaths: ["address.city", "address.zip"],
		},
		{
			name: "array elements use bracket notation",
			value: { tags: ["ok", 42, true] },
			spec: { tags: { type: "array", items: "string" } },
			strict: false,
			expectedPaths: ["tags[1]", "tags[2]"],
		},
		{
			name: "strict mode reports unexpected fields",
			value: { name: "Alice", extra: true, bonus: 1 },
			spec: { name: "string" },
			strict: true,
			expectedPaths: ["extra", "bonus"],
		},
		{
			name: "non-object root yields empty-path issue",
			value: null,
			spec: { name: "string" },
			strict: false,
			expectedPaths: [""],
		},
		{
			name: "nullable field accepts null",
			value: { name: null },
			spec: { name: { type: "string", nullable: true } },
			strict: false,
			expectedPaths: [],
		},
		{
			name: "non-nullable field rejects null",
			value: { name: null },
			spec: { name: "string" },
			strict: false,
			expectedPaths: ["name"],
		},
		{
			name: "prefix prepends to issue paths",
			value: {},
			spec: { x: "string" },
			strict: false,
			prefix: "root",
			expectedPaths: ["root.x"],
		},
	];

	it.each(cases)(
		"$name",
		({ value, spec, strict, prefix, expectedPaths }) => {
			const issues = validateObject(value, spec, strict, prefix);
			expect(issues).toHaveLength(expectedPaths.length);

			const paths = issues.map((issue) => issue.path);
			for (const expected of expectedPaths) {
				expect(paths).toContain(expected);
			}
		},
	);
});

// ---------------------------------------------------------------------------
// union / discriminated - behavioral coverage
// ---------------------------------------------------------------------------

describe("union fields", () => {
	const stringOrNumber = {
		value: {
			type: "union",
			of: ["string", "number"] as const,
		},
	} as const;

	const objectOrLiteral = {
		payload: {
			type: "union",
			of: [
				{ type: "object", shape: { id: "number" } },
				{ type: "literal", values: ["none"] as const },
			],
		},
	} as const;

	it.each([
		{
			name: "accepts first arm",
			spec: stringOrNumber,
			value: { value: "hi" },
			ok: true,
		},
		{
			name: "accepts later arm",
			spec: stringOrNumber,
			value: { value: 42 },
			ok: true,
		},
		{
			name: "rejects non-matching value",
			spec: stringOrNumber,
			value: { value: true },
			ok: false,
		},
		{
			name: "accepts object arm",
			spec: objectOrLiteral,
			value: { payload: { id: 1 } },
			ok: true,
		},
		{
			name: "accepts literal arm",
			spec: objectOrLiteral,
			value: { payload: "none" },
			ok: true,
		},
		{
			name: "rejects when no arm matches objectOrLiteral",
			spec: objectOrLiteral,
			value: { payload: { id: "x" } },
			ok: false,
		},
		{
			name: "nullable union accepts null",
			spec: {
				value: {
					type: "union",
					of: ["string", "number"] as const,
					nullable: true,
				},
			} as const,
			value: { value: null },
			ok: true,
		},
	])("$name", ({ spec, value, ok }) => {
		expect(isShape(value, spec)).toBe(ok);
	});
});

describe("discriminated fields", () => {
	const eventSpec = {
		event: {
			type: "discriminated",
			discriminant: "kind",
			variants: {
				click: { x: "number", y: "number" },
				navigate: { url: "string" },
			},
		},
	} as const;

	it.each([
		{
			name: "accepts click variant",
			value: { event: { kind: "click", x: 1, y: 2 } },
			ok: true,
		},
		{
			name: "accepts navigate variant",
			value: { event: { kind: "navigate", url: "/home" } },
			ok: true,
		},
		{
			name: "rejects unknown variant tag",
			value: { event: { kind: "scroll", x: 1 } },
			ok: false,
		},
		{
			name: "rejects non-string discriminant",
			value: { event: { kind: 1, x: 1, y: 2 } },
			ok: false,
		},
		{
			name: "rejects click missing required field",
			value: { event: { kind: "click", x: 1 } },
			ok: false,
		},
		{
			name: "rejects navigate with wrong field type",
			value: { event: { kind: "navigate", url: 99 } },
			ok: false,
		},
		{
			name: "rejects non-object event",
			value: { event: "click" },
			ok: false,
		},
	])("$name", ({ value, ok }) => {
		expect(isShape(value, eventSpec)).toBe(ok);
	});

	it.each([
		{
			name: "reports unknown variant on discriminant path",
			value: { event: { kind: "scroll" } },
			expectedPaths: ["event.kind"],
		},
		{
			name: "reports missing variant fields",
			value: { event: { kind: "click", x: 1 } },
			expectedPaths: ["event.y"],
		},
		{
			name: "reports non-string discriminant path",
			value: { event: { kind: false } },
			expectedPaths: ["event.kind"],
		},
	])("$name", ({ value, expectedPaths }) => {
		const issues = validateObject(value, eventSpec, false);
		const paths = issues.map((issue) => issue.path);
		for (const expected of expectedPaths) {
			expect(paths).toContain(expected);
		}
	});
});

// ---------------------------------------------------------------------------
// tuple / array bounds
// ---------------------------------------------------------------------------

describe("tuple fields", () => {
	const pair = {
		point: {
			type: "tuple",
			items: ["number", "number"] as const,
		},
	} as const;

	it.each([
		{
			name: "accepts matching length and types",
			value: { point: [1, 2] },
			ok: true,
		},
		{
			name: "rejects wrong length short",
			value: { point: [1] },
			ok: false,
		},
		{
			name: "rejects wrong length long",
			value: { point: [1, 2, 3] },
			ok: false,
		},
		{
			name: "rejects wrong element type",
			value: { point: [1, "y"] },
			ok: false,
		},
		{
			name: "rejects non-array",
			value: { point: { x: 1, y: 2 } },
			ok: false,
		},
	])("$name", ({ value, ok }) => {
		expect(isShape(value, pair)).toBe(ok);
	});
});

describe("array bounds", () => {
	const tags = {
		tags: {
			type: "array",
			items: "string",
			minItems: 1,
			maxItems: 3,
			uniqueItems: true,
		},
	} as const;

	it.each([
		{
			name: "accepts in-range unique items",
			value: { tags: ["a", "b"] },
			ok: true,
		},
		{
			name: "rejects below minItems",
			value: { tags: [] },
			ok: false,
		},
		{
			name: "rejects above maxItems",
			value: { tags: ["a", "b", "c", "d"] },
			ok: false,
		},
		{
			name: "rejects duplicate items when uniqueItems",
			value: { tags: ["a", "a"] },
			ok: false,
		},
	])("$name", ({ value, ok }) => {
		expect(isShape(value, tags)).toBe(ok);
	});

	it("rejects duplicate NaN under uniqueItems using SameValueZero", () => {
		const nums = {
			values: {
				type: "array",
				items: "number",
				uniqueItems: true,
			},
		} as const;
		expect(isShape({ values: [Number.NaN, Number.NaN] }, nums)).toBe(false);
		expect(isShape({ values: [Number.NaN] }, nums)).toBe(true);
	});

	it.each([
		{
			name: "reports length code for minItems",
			value: { tags: [] },
			expectedCodes: ["length"],
		},
		{
			name: "reports unique code for duplicates",
			value: { tags: ["x", "x"] },
			expectedCodes: ["unique"],
		},
	])("$name", ({ value, expectedCodes }) => {
		const issues = validateObject(value, tags, false);
		const codes = issues.map((issue) => issue.code);
		for (const code of expectedCodes) {
			expect(codes).toContain(code);
		}
	});
});

// ---------------------------------------------------------------------------
// Number / string constraints
// ---------------------------------------------------------------------------

describe("number constraints", () => {
	const age = {
		age: {
			type: "number",
			integer: true,
			minimum: 0,
			maximum: 120,
			multipleOf: 1,
		},
	} as const;

	const exclusive = {
		score: {
			type: "number",
			exclusiveMinimum: 0,
			exclusiveMaximum: 1,
		},
	} as const;

	it.each([
		{ name: "accepts in-range integer", value: { age: 30 }, ok: true },
		{ name: "rejects float when integer", value: { age: 30.5 }, ok: false },
		{ name: "rejects below minimum", value: { age: -1 }, ok: false },
		{ name: "rejects above maximum", value: { age: 121 }, ok: false },
		{ name: "accepts boundary minimum", value: { age: 0 }, ok: true },
		{ name: "accepts boundary maximum", value: { age: 120 }, ok: true },
	])("$name", ({ value, ok }) => {
		expect(isShape(value, age)).toBe(ok);
	});

	it.each([
		{ name: "accepts exclusive interior", value: { score: 0.5 }, ok: true },
		{ name: "rejects exclusive minimum", value: { score: 0 }, ok: false },
		{ name: "rejects exclusive maximum", value: { score: 1 }, ok: false },
	])("$name", ({ value, ok }) => {
		expect(isShape(value, exclusive)).toBe(ok);
	});

	it("rejects non-multipleOf values", () => {
		const step = {
			n: { type: "number", multipleOf: 0.5 },
		} as const;
		expect(isShape({ n: 1.5 }, step)).toBe(true);
		expect(isShape({ n: 1.25 }, step)).toBe(false);
	});

	it("reports range code for bound violations", () => {
		const issues = validateObject({ age: -1 }, age, false);
		const codes = issues.map((issue) => issue.code);
		expect(codes).toContain("range");
	});
});

describe("string constraints", () => {
	const name = {
		name: {
			type: "string",
			minLength: 2,
			maxLength: 5,
			pattern: /^[a-z]+$/,
		},
	} as const;

	it.each([
		{ name: "accepts matching string", value: { name: "abc" }, ok: true },
		{ name: "rejects too short", value: { name: "a" }, ok: false },
		{ name: "rejects too long", value: { name: "abcdef" }, ok: false },
		{ name: "rejects pattern miss", value: { name: "Ab" }, ok: false },
	])("$name", ({ value, ok }) => {
		expect(isShape(value, name)).toBe(ok);
	});

	it("does not leak global RegExp lastIndex across calls", () => {
		const pattern = /a/g;
		const spec = {
			s: { type: "string", pattern },
		} as const;
		expect(isShape({ s: "a" }, spec)).toBe(true);
		expect(isShape({ s: "a" }, spec)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// refine
// ---------------------------------------------------------------------------

describe("refine", () => {
	const even = {
		n: {
			type: "number",
			integer: true,
			refine: (value: unknown) => {
				if (typeof value !== "number") {
					return false;
				}

				return value % 2 === 0;
			},
			refineMessage: "must be even",
		},
	} as const;

	it("accepts values that pass refine", () => {
		expect(isShape({ n: 4 }, even)).toBe(true);
	});

	it("rejects values that fail refine with refine code", () => {
		const issues = validateObject({ n: 3 }, even, false);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.code).toBe("refine");
		expect(issues[0]?.message).toContain("must be even");
	});
});

// ---------------------------------------------------------------------------
// decimal
// ---------------------------------------------------------------------------

describe("decimal fields", () => {
	const amount = {
		amount: {
			type: "decimal",
			minimum: "0",
			maximum: "1000",
			fractionDigits: 2,
			totalDigits: 6,
		},
	} as const;

	it.each([
		{
			name: "accepts numeric string",
			value: { amount: "12.50" },
			ok: true,
		},
		{
			name: "accepts Decimal instance",
			value: { amount: new Decimal("12.50") },
			ok: true,
		},
		{
			name: "rejects bare number by default",
			value: { amount: 12.5 },
			ok: false,
		},
		{
			name: "rejects below minimum",
			value: { amount: "-0.01" },
			ok: false,
		},
		{
			name: "rejects above maximum",
			value: { amount: "1000.01" },
			ok: false,
		},
		{
			name: "rejects excess fraction digits",
			value: { amount: "1.234" },
			ok: false,
		},
		{
			name: "rejects invalid string",
			value: { amount: "nope" },
			ok: false,
		},
	])("$name", ({ value, ok }) => {
		expect(isShape(value, amount)).toBe(ok);
	});

	it("accepts bare number when allowNumber is true", () => {
		const loose = {
			amount: { type: "decimal", allowNumber: true },
		} as const;
		expect(isShape({ amount: 12.5 }, loose)).toBe(true);
	});

	it("reports range code for decimal bound violations", () => {
		const issues = validateObject({ amount: "-1" }, amount, false);
		const codes = issues.map((issue) => issue.code);
		expect(codes).toContain("range");
	});

	it("rejects exclusiveMinimum violations", () => {
		const spec = {
			amount: { type: "decimal", exclusiveMinimum: "0" },
		} as const;
		expect(isShape({ amount: "0" }, spec)).toBe(false);
		expect(isShape({ amount: "0.01" }, spec)).toBe(true);
	});

	it("rejects exclusiveMaximum violations", () => {
		const spec = {
			amount: { type: "decimal", exclusiveMaximum: "10" },
		} as const;
		expect(isShape({ amount: "10" }, spec)).toBe(false);
		expect(isShape({ amount: "9.99" }, spec)).toBe(true);
	});

	it("rejects totalDigits overflow", () => {
		const spec = {
			amount: { type: "decimal", totalDigits: 3 },
		} as const;
		expect(isShape({ amount: "999" }, spec)).toBe(true);
		expect(isShape({ amount: "9999" }, spec)).toBe(false);
	});

	it("rejects non-finite Decimal and allowNumber NaN", () => {
		expect(isShape({ amount: new Decimal(Number.NaN) }, amount)).toBe(
			false,
		);
		expect(
			isShape(
				{ amount: Number.NaN },
				{ amount: { type: "decimal", allowNumber: true } },
			),
		).toBe(false);
	});

	it("rejects oversized decimal strings before coerce", () => {
		const huge = `1${"0".repeat(5000)}`;
		expect(isShape({ amount: huge }, amount)).toBe(false);
	});

	it("accepts barrel-compatible Decimal from decimal.js", () => {
		expect(isShape({ amount: new Decimal("1.00") }, amount)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// own-property discipline
// ---------------------------------------------------------------------------

describe("own-property field reads", () => {
	it("rejects prototype-inherited required fields", () => {
		const proto = { name: "Ada" };
		const value: unknown = Object.create(proto);
		expect(isShape(value, { name: "string" })).toBe(false);
	});

	it("rejects prototype-inherited discriminant tags", () => {
		const spec = {
			event: {
				type: "discriminated",
				discriminant: "kind",
				variants: {
					click: { x: "number" },
				},
			},
		} as const;
		const proto = { kind: "click", x: 1 };
		const event: unknown = Object.create(proto);
		expect(isShape({ event }, spec)).toBe(false);
	});

	it("does not attach value on validation issues by default", () => {
		const issues = validateObject({ name: 1 }, { name: "string" }, false);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.value).toBeUndefined();
	});

	it("does not embed raw input in literal failure messages", () => {
		const secret = "s3cr3t-token";
		const issues = validateObject(
			{ status: secret },
			{ status: { type: "literal", values: ["ok"] as const } },
			false,
		);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.message).not.toContain(secret);
		expect(issues[0]?.value).toBeUndefined();
	});
});
