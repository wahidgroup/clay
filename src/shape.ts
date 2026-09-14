/**
 * Spec-driven shape validation with type-level inference.
 *
 * Validates unknown values against declarative field specs and narrows
 * them to fully typed objects.
 */

import type { ValidationIssue, ValidationIssueCode } from "./errors/validation-issue.js";
import type {
	ArrayFieldSpec,
	DecimalFieldSpec,
	DiscriminatedFieldSpec,
	FieldDef,
	FieldSpec,
	LiteralFieldSpec,
	ObjectFieldSpec,
	PrimitiveFieldSpec,
	PrimitiveType,
	RecordFieldSpec,
	ShapeOf,
	TupleFieldSpec,
	UnionFieldSpec,
} from "./shape-types.js";
import { isPlainRecord, isRecord } from "./guards.js";
import { Decimal } from "./shape-types.js";

export type {
	ArrayFieldSpec,
	DecimalFieldSpec,
	DiscriminatedFieldSpec,
	FieldDef,
	FieldSpec,
	LiteralFieldSpec,
	ObjectFieldSpec,
	PrimitiveFieldSpec,
	PrimitiveType,
	RecordFieldSpec,
	ShapeOf,
	TupleFieldSpec,
	UnionFieldSpec,
};
export { Decimal };

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a shorthand `FieldDef` to a full `FieldSpec`.
 */
function normalizeSpec(def: FieldDef): FieldSpec {
	if (typeof def === "string") {
		return { type: def };
	}

	return def;
}

/**
 * Builds a human-readable issue message with root-path hygiene.
 */
function describeFailure(path: string, detail: string): string {
	if (!path) {
		return `Value ${detail}`;
	}

	return `Field ${path} ${detail}`;
}

/**
 * Creates a structured validation issue.
 */
function makeIssue(
	path: string,
	code: ValidationIssueCode,
	detail: string,
	extras?: { expected?: string },
): ValidationIssue {
	const issue: ValidationIssue = {
		path,
		code,
		message: describeFailure(path, detail),
	};

	if (extras?.expected === undefined) {
		return issue;
	}

	return { ...issue, expected: extras.expected };
}

/**
 * A queued field-level validation item.
 */
interface FieldWorkItem {
	readonly kind: "field";
	readonly value: unknown;
	readonly spec: FieldSpec;
	readonly path: string;
}

/**
 * A queued object-level validation item.
 */
interface ObjectWorkItem {
	readonly kind: "object";
	readonly value: unknown;
	readonly fields: Record<string, FieldDef>;
	readonly path: string;
}

/**
 * Discriminated union of work items for the validation stack.
 */
type WorkItem = FieldWorkItem | ObjectWorkItem;

/**
 * Mutable validation run state. Always drained iteratively (no
 * call-stack recursion over value depth).
 */
interface ValidateCtx {
	readonly issues: ValidationIssue[];
	readonly stack: WorkItem[];
	readonly strict: boolean;
	/**
	 * When true, stop after the first issue (union arm probes).
	 */
	readonly bail: boolean;
}

/**
 * Records an issue. Returns `false` when the run should stop (`bail`).
 */
function noteIssue(ctx: ValidateCtx, issue: ValidationIssue): boolean {
	ctx.issues.push(issue);
	if (ctx.bail) {
		return false;
	}

	return true;
}

/**
 * Builds a dotted / rooted field path under a parent path.
 */
function childPath(parent: string, key: string): string {
	if (!parent) {
		return key;
	}

	return `${parent}.${key}`;
}

/**
 * Drains the work stack iteratively until empty or bail.
 */
function drain(ctx: ValidateCtx): void {
	while (ctx.stack.length > 0) {
		const current = ctx.stack.pop();
		if (current === undefined) {
			break;
		}

		let cont: boolean;
		if (current.kind === "object") {
			cont = processObjectWork(ctx, current);
		} else {
			cont = processFieldWork(ctx, current);
		}

		if (!cont) {
			ctx.stack.length = 0;
			break;
		}
	}
}

/**
 * True when `value` conforms to `spec` (iterative probe, first failure).
 */
function matches(value: unknown, spec: FieldSpec, path: string, strict: boolean): boolean {
	const ctx: ValidateCtx = {
		issues: [],
		stack: [{ kind: "field", value, spec, path }],
		strict,
		bail: true,
	};
	drain(ctx);

	return ctx.issues.length === 0;
}

/**
 * Collects every issue under `initial` (iterative).
 */
function validate(initial: WorkItem, strict: boolean): ValidationIssue[] {
	const ctx: ValidateCtx = {
		issues: [],
		stack: [initial],
		strict,
		bail: false,
	};
	drain(ctx);

	return ctx.issues;
}

/**
 * Processes one object work item. Returns `false` when bailing.
 */
function processObjectWork(ctx: ValidateCtx, current: ObjectWorkItem): boolean {
	if (!isRecord(current.value)) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be an object", {
				expected: "object",
			}),
		);
	}

	const fieldKeys = Object.keys(current.fields);
	for (let i = fieldKeys.length - 1; i >= 0; i--) {
		const key = fieldKeys[i];
		if (key === undefined) {
			continue;
		}

		const def = current.fields[key];
		if (def === undefined) {
			continue;
		}

		const spec = normalizeSpec(def);
		const fieldPath = childPath(current.path, key);

		if (!Object.hasOwn(current.value, key)) {
			if (!spec.optional) {
				const ok = noteIssue(
					ctx,
					makeIssue(fieldPath, "missing", "is required", {
						expected: "present",
					}),
				);
				if (!ok) {
					return false;
				}
			}

			continue;
		}

		const fieldValue: unknown = Reflect.get(current.value, key);
		ctx.stack.push({
			kind: "field",
			value: fieldValue,
			spec,
			path: fieldPath,
		});
	}

	if (!ctx.strict) {
		return true;
	}

	for (const key of Object.keys(current.value)) {
		if (Object.hasOwn(current.fields, key)) {
			continue;
		}

		const fieldPath = childPath(current.path, key);
		const ok = noteIssue(ctx, makeIssue(fieldPath, "unexpected", "is not allowed"));
		if (!ok) {
			return false;
		}
	}

	return true;
}

/**
 * Processes one field work item. Returns `false` when bailing.
 */
function processFieldWork(ctx: ValidateCtx, current: FieldWorkItem): boolean {
	if (current.value === null) {
		if (current.spec.nullable) {
			return true;
		}

		return noteIssue(
			ctx,
			makeIssue(current.path, "null", "must not be null", {
				expected: "non-null",
			}),
		);
	}

	let ok: boolean;

	if (current.spec.type === "string" || current.spec.type === "number" || current.spec.type === "boolean") {
		ok = processPrimitive(ctx, current);
	} else if (current.spec.type === "decimal") {
		ok = processDecimal(ctx, current, current.spec);
	} else if (current.spec.type === "array") {
		ok = processArray(ctx, current, current.spec);
	} else if (current.spec.type === "tuple") {
		ok = processTuple(ctx, current, current.spec);
	} else if (current.spec.type === "object") {
		ctx.stack.push({
			kind: "object",
			value: current.value,
			fields: current.spec.shape,
			path: current.path,
		});
		ok = true;
	} else if (current.spec.type === "record") {
		ok = processRecord(ctx, current, current.spec);
	} else if (current.spec.type === "literal") {
		ok = processLiteral(ctx, current, current.spec);
	} else if (current.spec.type === "union") {
		ok = processUnion(ctx, current, current.spec);
	} else if (current.spec.type === "discriminated") {
		ok = processDiscriminated(ctx, current, current.spec);
	} else {
		return noteIssue(ctx, makeIssue(current.path, "spec", "has an unknown field spec type"));
	}

	if (!ok) {
		return false;
	}

	return applyRefine(ctx, current.path, current.value, current.spec);
}

/**
 * Runs an optional `refine` predicate after structural checks.
 */
function applyRefine(ctx: ValidateCtx, path: string, value: unknown, spec: FieldSpec): boolean {
	if (!spec.refine) {
		return true;
	}
	if (spec.refine(value)) {
		return true;
	}

	let detail = "failed refine check";
	if (spec.refineMessage) {
		detail = spec.refineMessage;
	}

	return noteIssue(ctx, makeIssue(path, "refine", detail));
}

/**
 * Primitive typeof check plus number/string constraints.
 */
function processPrimitive(ctx: ValidateCtx, current: FieldWorkItem): boolean {
	const spec = current.spec;
	if (spec.type !== "string" && spec.type !== "number" && spec.type !== "boolean") {
		return true;
	}

	if (typeof current.value !== spec.type) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", `must be ${spec.type}, got ${typeof current.value}`, {
				expected: spec.type,
			}),
		);
	}
	if (spec.type === "number") {
		if (typeof current.value !== "number") {
			return true;
		}

		return processNumberConstraints(ctx, current.path, current.value, spec);
	}
	if (spec.type === "string") {
		if (typeof current.value !== "string") {
			return true;
		}

		return processStringConstraints(ctx, current.path, current.value, spec);
	}

	return true;
}

/**
 * True when `value / multipleOf` is an integer within float tolerance.
 */
function isMultipleOf(value: number, multipleOf: number): boolean {
	if (!Number.isFinite(value) || !Number.isFinite(multipleOf)) {
		return false;
	}

	if (multipleOf === 0) {
		return false;
	}

	const quotient = value / multipleOf;
	const nearest = Math.round(quotient);
	return Math.abs(quotient - nearest) <= Number.EPSILON * Math.abs(quotient);
}

/**
 * Number integer / range / multipleOf constraints.
 */
function processNumberConstraints(ctx: ValidateCtx, path: string, value: number, spec: PrimitiveFieldSpec): boolean {
	let ok = true;

	if (spec.integer && !Number.isInteger(value)) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "type", "must be an integer", {
				expected: "integer",
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.exclusiveMinimum !== undefined && !(value > spec.exclusiveMinimum)) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "range", `must be greater than ${spec.exclusiveMinimum}`, {
				expected: `>${spec.exclusiveMinimum}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.exclusiveMaximum !== undefined && !(value < spec.exclusiveMaximum)) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "range", `must be less than ${spec.exclusiveMaximum}`, {
				expected: `<${spec.exclusiveMaximum}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.minimum !== undefined && value < spec.minimum) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "range", `must be >= ${spec.minimum}`, {
				expected: `>=${spec.minimum}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.maximum !== undefined && value > spec.maximum) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "range", `must be <= ${spec.maximum}`, {
				expected: `<=${spec.maximum}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.multipleOf !== undefined && !isMultipleOf(value, spec.multipleOf)) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "range", `must be a multiple of ${spec.multipleOf}`, {
				expected: `multipleOf:${spec.multipleOf}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	return ok;
}

/**
 * Matches `pattern` without mutating a shared global `lastIndex`.
 */
function matchesPattern(value: string, pattern: RegExp): boolean {
	const flags = pattern.flags.replaceAll("g", "");
	const re = new RegExp(pattern.source, flags);
	return re.test(value);
}

/**
 * String length / pattern constraints.
 */
function processStringConstraints(ctx: ValidateCtx, path: string, value: string, spec: PrimitiveFieldSpec): boolean {
	let ok = true;
	const length = value.length;

	if (spec.minLength !== undefined && length < spec.minLength) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "length", `must have length >= ${spec.minLength}, got ${length}`, {
				expected: `minLength:${spec.minLength}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.maxLength !== undefined && length > spec.maxLength) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "length", `must have length <= ${spec.maxLength}, got ${length}`, {
				expected: `maxLength:${spec.maxLength}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.pattern !== undefined && !matchesPattern(value, spec.pattern)) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "pattern", "must match pattern", {
				expected: spec.pattern.source,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	return ok;
}

/**
 * Hard cap on decimal string length before coercion (DoS guard).
 */
const MAX_DECIMAL_INPUT_CHARS = 4096;

/**
 * Parses a decimal input. Returns `null` when the value is not accepted.
 */
function parseDecimalInput(value: unknown, allowNumber: boolean): Decimal | null {
	if (value instanceof Decimal) {
		if (!value.isFinite()) {
			return null;
		}

		return value;
	}

	if (typeof value === "string") {
		if (value.length > MAX_DECIMAL_INPUT_CHARS) {
			return null;
		}

		try {
			const parsed = new Decimal(value);
			if (!parsed.isFinite()) {
				return null;
			}

			return parsed;
		} catch {
			return null;
		}
	}

	if (allowNumber && typeof value === "number") {
		if (!Number.isFinite(value)) {
			return null;
		}

		return new Decimal(value);
	}

	return null;
}

/**
 * Coerces a bound into a finite decimal, or `null` when invalid.
 */
function toDecimalBound(bound: string | Decimal): Decimal | null {
	if (bound instanceof Decimal) {
		if (!bound.isFinite()) {
			return null;
		}

		return bound;
	}
	if (bound.length > MAX_DECIMAL_INPUT_CHARS) {
		return null;
	}

	try {
		const parsed = new Decimal(bound);
		if (!parsed.isFinite()) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

/**
 * Counts significant digits (precision) for totalDigits checks.
 */
function decimalTotalDigits(value: Decimal): number {
	return value.precision();
}

/**
 * Decimal type, bounds, and digit constraints.
 */
function processDecimal(ctx: ValidateCtx, current: FieldWorkItem, spec: DecimalFieldSpec): boolean {
	let allowNumber = false;
	if (spec.allowNumber) {
		allowNumber = true;
	}

	const parsed = parseDecimalInput(current.value, allowNumber);
	if (!parsed) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be a decimal (Decimal or numeric string)", {
				expected: "decimal",
			}),
		);
	}

	let ok = true;

	if (spec.exclusiveMinimum !== undefined) {
		const bound = toDecimalBound(spec.exclusiveMinimum);
		if (bound && !parsed.gt(bound)) {
			ok = noteIssue(
				ctx,
				makeIssue(current.path, "range", `must be greater than ${bound.toString()}`, {
					expected: `>${bound.toString()}`,
				}),
			);
			if (!ok) {
				return false;
			}
		}
	}

	if (spec.exclusiveMaximum !== undefined) {
		const bound = toDecimalBound(spec.exclusiveMaximum);
		if (bound && !parsed.lt(bound)) {
			ok = noteIssue(
				ctx,
				makeIssue(current.path, "range", `must be less than ${bound.toString()}`, {
					expected: `<${bound.toString()}`,
				}),
			);
			if (!ok) {
				return false;
			}
		}
	}

	if (spec.minimum !== undefined) {
		const bound = toDecimalBound(spec.minimum);
		if (bound && parsed.lt(bound)) {
			ok = noteIssue(
				ctx,
				makeIssue(current.path, "range", `must be >= ${bound.toString()}`, {
					expected: `>=${bound.toString()}`,
				}),
			);
			if (!ok) {
				return false;
			}
		}
	}

	if (spec.maximum !== undefined) {
		const bound = toDecimalBound(spec.maximum);
		if (bound && parsed.gt(bound)) {
			ok = noteIssue(
				ctx,
				makeIssue(current.path, "range", `must be <= ${bound.toString()}`, {
					expected: `<=${bound.toString()}`,
				}),
			);
			if (!ok) {
				return false;
			}
		}
	}

	if (spec.fractionDigits !== undefined && parsed.decimalPlaces() > spec.fractionDigits) {
		ok = noteIssue(
			ctx,
			makeIssue(current.path, "range", `must have at most ${spec.fractionDigits} fraction digits`, {
				expected: `fractionDigits:${spec.fractionDigits}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.totalDigits !== undefined && decimalTotalDigits(parsed) > spec.totalDigits) {
		ok = noteIssue(
			ctx,
			makeIssue(current.path, "range", `must have at most ${spec.totalDigits} significant digits`, {
				expected: `totalDigits:${spec.totalDigits}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	return ok;
}

/**
 * Reports duplicate array elements in O(n) via SameValueZero (`Set`).
 */
function processUniqueItems(ctx: ValidateCtx, path: string, values: readonly unknown[]): boolean {
	const seen = new Set<unknown>();
	for (let i = 0; i < values.length; i++) {
		const item = values[i];
		if (seen.has(item)) {
			const ok = noteIssue(ctx, makeIssue(`${path}[${i}]`, "unique", "must be unique within the array"));
			if (!ok) {
				return false;
			}

			continue;
		}

		seen.add(item);
	}

	return true;
}

/**
 * Array type, bounds, uniqueness, then enqueue element checks.
 */
function processArray(ctx: ValidateCtx, current: FieldWorkItem, spec: ArrayFieldSpec): boolean {
	if (!Array.isArray(current.value)) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be an array", {
				expected: "array",
			}),
		);
	}

	const length = current.value.length;
	if (spec.minItems !== undefined && length < spec.minItems) {
		const ok = noteIssue(
			ctx,
			makeIssue(current.path, "length", `must have at least ${spec.minItems} items, got ${length}`, {
				expected: `minItems:${spec.minItems}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.maxItems !== undefined && length > spec.maxItems) {
		const ok = noteIssue(
			ctx,
			makeIssue(current.path, "length", `must have at most ${spec.maxItems} items, got ${length}`, {
				expected: `maxItems:${spec.maxItems}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.uniqueItems) {
		const ok = processUniqueItems(ctx, current.path, current.value);
		if (!ok) {
			return false;
		}
	}

	const itemSpec = normalizeSpec(spec.items);
	for (let i = length - 1; i >= 0; i--) {
		ctx.stack.push({
			kind: "field",
			value: current.value[i],
			spec: itemSpec,
			path: `${current.path}[${i}]`,
		});
	}

	return true;
}

/**
 * Fixed-length tuple with per-index specs.
 */
function processTuple(ctx: ValidateCtx, current: FieldWorkItem, spec: TupleFieldSpec): boolean {
	if (!Array.isArray(current.value)) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be a tuple", {
				expected: "tuple",
			}),
		);
	}

	const expectedLength = spec.items.length;
	if (current.value.length !== expectedLength) {
		const ok = noteIssue(
			ctx,
			makeIssue(current.path, "length", `must have length ${expectedLength}, got ${current.value.length}`, {
				expected: `length:${expectedLength}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	let limit = expectedLength;
	if (current.value.length < expectedLength) {
		limit = current.value.length;
	}

	for (let i = limit - 1; i >= 0; i--) {
		const itemDef = spec.items[i];
		if (itemDef === undefined) {
			continue;
		}

		ctx.stack.push({
			kind: "field",
			value: current.value[i],
			spec: normalizeSpec(itemDef),
			path: `${current.path}[${i}]`,
		});
	}

	return true;
}

/**
 * Record type, entry bounds, and key pattern, then enqueue value checks.
 */
function processRecord(ctx: ValidateCtx, current: FieldWorkItem, spec: RecordFieldSpec): boolean {
	if (!isPlainRecord(current.value)) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be an object", {
				expected: "object",
			}),
		);
	}

	const keys = Object.keys(current.value);
	if (spec.minEntries !== undefined && keys.length < spec.minEntries) {
		const ok = noteIssue(
			ctx,
			makeIssue(current.path, "length", `must have at least ${spec.minEntries} entries, got ${keys.length}`, {
				expected: `minEntries:${spec.minEntries}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.maxEntries !== undefined && keys.length > spec.maxEntries) {
		const ok = noteIssue(
			ctx,
			makeIssue(current.path, "length", `must have at most ${spec.maxEntries} entries, got ${keys.length}`, {
				expected: `maxEntries:${spec.maxEntries}`,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	const valueSpec = normalizeSpec(spec.values);
	for (let i = keys.length - 1; i >= 0; i--) {
		const key = keys[i];
		if (key === undefined) {
			continue;
		}

		const entryPath = childPath(current.path, key);
		if (spec.keys && !matchesPattern(key, spec.keys)) {
			const ok = noteIssue(
				ctx,
				makeIssue(entryPath, "pattern", `key must match ${String(spec.keys)}`, {
					expected: String(spec.keys),
				}),
			);
			if (!ok) {
				return false;
			}

			continue;
		}

		ctx.stack.push({
			kind: "field",
			value: Reflect.get(current.value, key),
			spec: valueSpec,
			path: entryPath,
		});
	}

	return true;
}

/**
 * Literal membership check.
 */
function processLiteral(ctx: ValidateCtx, current: FieldWorkItem, spec: LiteralFieldSpec): boolean {
	for (const allowed of spec.values) {
		if (current.value === allowed) {
			return true;
		}
	}

	const expected = spec.values.join(", ");
	return noteIssue(
		ctx,
		makeIssue(current.path, "literal", `must be one of [${expected}]`, {
			expected: `[${expected}]`,
		}),
	);
}

/**
 * First-matching union arm (probe via iterative bail matches).
 */
function processUnion(ctx: ValidateCtx, current: FieldWorkItem, spec: UnionFieldSpec): boolean {
	for (const arm of spec.of) {
		const armSpec = normalizeSpec(arm);
		if (matches(current.value, armSpec, current.path, ctx.strict)) {
			return true;
		}
	}

	return noteIssue(ctx, makeIssue(current.path, "union", "does not match any union variant"));
}

/**
 * Discriminant-selected object variant; enqueues object work.
 */
function processDiscriminated(ctx: ValidateCtx, current: FieldWorkItem, spec: DiscriminatedFieldSpec): boolean {
	if (!isRecord(current.value)) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be an object", {
				expected: "object",
			}),
		);
	}

	const disc = spec.discriminant;
	const discPath = childPath(current.path, disc);

	if (!Object.hasOwn(current.value, disc)) {
		return noteIssue(
			ctx,
			makeIssue(discPath, "missing", "is required", {
				expected: "present",
			}),
		);
	}

	const tag: unknown = Reflect.get(current.value, disc);

	if (typeof tag !== "string") {
		return noteIssue(
			ctx,
			makeIssue(discPath, "discriminant", "must be a string discriminant", { expected: "string" }),
		);
	}

	let variant: Record<string, FieldDef> | undefined;
	if (Object.hasOwn(spec.variants, tag)) {
		variant = spec.variants[tag];
	}
	if (variant === undefined) {
		return noteIssue(
			ctx,
			makeIssue(discPath, "unknown_variant", "has unknown variant", {
				expected: "known variant",
			}),
		);
	}

	const fields: Record<string, FieldDef> = {
		...variant,
		[disc]: { type: "literal", values: [tag] },
	};
	ctx.stack.push({
		kind: "object",
		value: current.value,
		fields,
		path: current.path,
	});
	return true;
}

/**
 * Validates a value against an object shape spec.
 * Returns a list of all validation issues (empty when valid).
 */
export function validateObject(
	value: unknown,
	fields: Record<string, FieldDef>,
	strict: boolean,
	prefix?: string,
): ValidationIssue[] {
	const initial: ObjectWorkItem = {
		kind: "object",
		value,
		fields,
		path: prefix ?? "",
	};
	return validate(initial, strict);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Narrows `value` when `issues` is empty.
 *
 * Shared by try/create APIs so callers avoid type assertions.
 */
export function hasNoShapeIssues<T>(value: unknown, issues: readonly ValidationIssue[]): value is T {
	return issues.length === 0;
}

/**
 * Predicate guard: returns `true` when `value` conforms to the spec.
 *
 * Extra fields beyond the spec are permitted.
 */
export function isShape<F extends Record<string, FieldDef>>(value: unknown, fields: F): value is ShapeOf<F> {
	const issues = validateObject(value, fields, false);
	return hasNoShapeIssues<ShapeOf<F>>(value, issues);
}

/**
 * Discriminated result of a non-throwing shape validation.
 */
export type ShapeResult<T> =
	{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

/**
 * Validates without throwing. Returns the narrowed value or all issues.
 *
 * Extra fields beyond the spec are permitted.
 */
export function tryShape<F extends Record<string, FieldDef>>(value: unknown, fields: F): ShapeResult<ShapeOf<F>> {
	const issues = validateObject(value, fields, false);
	if (!hasNoShapeIssues<ShapeOf<F>>(value, issues)) {
		return { ok: false, issues };
	}

	return { ok: true, value };
}

/**
 * Strict variant of {@link tryShape}. Rejects extra fields.
 */
export function tryStrictShape<F extends Record<string, FieldDef>>(
	value: unknown,
	fields: F,
): ShapeResult<ShapeOf<F, true>> {
	const issues = validateObject(value, fields, true);
	if (!hasNoShapeIssues<ShapeOf<F, true>>(value, issues)) {
		return { ok: false, issues };
	}

	return { ok: true, value };
}
