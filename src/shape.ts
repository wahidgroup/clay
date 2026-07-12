/**
 * Spec-driven shape validation with type-level inference.
 *
 * Validates unknown values against declarative field specs and narrows
 * them to fully typed objects.
 */

import { createRequire } from "node:module";

import type {
	ValidationIssue,
	ValidationIssueCode,
} from "./errors/validation-issue.js";
import { isRecord } from "./guards.js";

// ---------------------------------------------------------------------------
// Field spec types
// ---------------------------------------------------------------------------

/**
 * Allowed primitive type names for field validation.
 */
export type PrimitiveType = "string" | "number" | "boolean";

/**
 * Maps a primitive type name to the corresponding TypeScript type.
 */
interface PrimitiveMap {
	string: string;
	number: number;
	boolean: boolean;
}

/**
 * Optional post-check predicate shared by structured field specs.
 *
 * Runs after type / structural checks for the node succeed.
 */
interface HasRefine {
	readonly refine?: (value: unknown) => boolean;
	readonly refineMessage?: string;
}

/**
 * Minimal decimal surface for bounds and inference.
 *
 * Satisfied by `decimal.js` `Decimal` instances without importing
 * that package into this library's public type graph.
 */
export interface DecimalLike {
	isFinite(): boolean;
	gt(other: DecimalLike | string | number): boolean;
	lt(other: DecimalLike | string | number): boolean;
	decimalPlaces(): number;
	precision(): number;
	toString(): string;
}

/**
 * A field whose value must match a primitive `typeof` check.
 *
 * Number constraints (`integer`, bounds, `multipleOf`) apply only
 * when `type` is `"number"`. String constraints (`minLength`,
 * `maxLength`, `pattern`) apply only when `type` is `"string"`.
 */
export interface PrimitiveFieldSpec extends HasRefine {
	readonly type: PrimitiveType;
	readonly optional?: boolean;
	readonly nullable?: boolean;
	readonly integer?: boolean;
	readonly minimum?: number;
	readonly maximum?: number;
	readonly exclusiveMinimum?: number;
	readonly exclusiveMaximum?: number;
	readonly multipleOf?: number;
	readonly minLength?: number;
	readonly maxLength?: number;
	readonly pattern?: RegExp;
}

/**
 * A field whose value must be an exact decimal (`decimal.js` peer).
 *
 * Accepts `DecimalLike` instances and numeric strings by default.
 * Bare `number` is rejected unless `allowNumber` is `true`
 * (IEEE-754 binary floats are unsafe for exact quantities).
 *
 * Runtime loads optional peer `decimal.js` only when this arm runs
 * and a constructor is needed (string / number coercion).
 */
export interface DecimalFieldSpec extends HasRefine {
	readonly type: "decimal";
	readonly optional?: boolean;
	readonly nullable?: boolean;
	readonly allowNumber?: boolean;
	readonly minimum?: string | DecimalLike;
	readonly maximum?: string | DecimalLike;
	readonly exclusiveMinimum?: string | DecimalLike;
	readonly exclusiveMaximum?: string | DecimalLike;
	readonly totalDigits?: number;
	readonly fractionDigits?: number;
}

/**
 * A field whose value must be an array with every element
 * matching the `items` spec.
 */
export interface ArrayFieldSpec extends HasRefine {
	readonly type: "array";
	readonly items: FieldDef;
	readonly optional?: boolean;
	readonly nullable?: boolean;
	readonly minItems?: number;
	readonly maxItems?: number;
	readonly uniqueItems?: boolean;
}

/**
 * A field whose value must be a fixed-length tuple with
 * per-index specs.
 */
export interface TupleFieldSpec extends HasRefine {
	readonly type: "tuple";
	readonly items: readonly FieldDef[];
	readonly optional?: boolean;
	readonly nullable?: boolean;
}

/**
 * A field whose value must be a plain object matching the
 * nested `shape` spec.
 */
export interface ObjectFieldSpec extends HasRefine {
	readonly type: "object";
	readonly shape: Record<string, FieldDef>;
	readonly optional?: boolean;
	readonly nullable?: boolean;
}

/**
 * A field whose value must be one of a fixed set of literals.
 */
export interface LiteralFieldSpec extends HasRefine {
	readonly type: "literal";
	readonly values: readonly (string | number | boolean)[];
	readonly optional?: boolean;
	readonly nullable?: boolean;
}

/**
 * A field whose value must match at least one arm (first match wins).
 */
export interface UnionFieldSpec extends HasRefine {
	readonly type: "union";
	readonly of: readonly FieldDef[];
	readonly optional?: boolean;
	readonly nullable?: boolean;
}

/**
 * A field whose object shape is selected by a string discriminant key.
 *
 * Variant maps omit the discriminant field; runtime injects
 * `{ [discriminant]: literal(tag) }` before validating the chosen arm.
 */
export interface DiscriminatedFieldSpec extends HasRefine {
	readonly type: "discriminated";
	readonly discriminant: string;
	readonly variants: Record<string, Record<string, FieldDef>>;
	readonly optional?: boolean;
	readonly nullable?: boolean;
}

/**
 * Union of all structured field spec variants.
 */
export type FieldSpec =
	| PrimitiveFieldSpec
	| DecimalFieldSpec
	| ArrayFieldSpec
	| TupleFieldSpec
	| ObjectFieldSpec
	| LiteralFieldSpec
	| UnionFieldSpec
	| DiscriminatedFieldSpec;

/**
 * A field definition: either a shorthand primitive type name
 * or a full spec object.
 */
export type FieldDef = PrimitiveType | FieldSpec;

// ---------------------------------------------------------------------------
// Type-level inference
// ---------------------------------------------------------------------------

/**
 * Depth counter for recursive field inference. Prevents unbounded
 * expansion when `FieldDef` appears in open positions such as
 * `Record<string, FieldDef>`.
 */
type InferDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Infers the TypeScript type for a single `FieldDef` before
 * applying nullability.
 */
type InferFieldDefBase<
	F extends FieldDef,
	D extends number,
> = F extends PrimitiveType
	? PrimitiveMap[F]
	: F extends PrimitiveFieldSpec
		? PrimitiveMap[F["type"]]
		: F extends DecimalFieldSpec
			? DecimalLike
			: F extends ArrayFieldSpec
				? InferFieldDef<F["items"], InferDepth[D]>[]
				: F extends TupleFieldSpec
					? InferTupleItems<F["items"], InferDepth[D]>
					: F extends ObjectFieldSpec
						? ShapeOf<F["shape"]>
						: F extends LiteralFieldSpec
							? F["values"][number]
							: F extends UnionFieldSpec
								? InferFieldDef<F["of"][number], InferDepth[D]>
								: F extends DiscriminatedFieldSpec
									? InferDiscriminated<F>
									: never;

/**
 * Maps each tuple item spec to its inferred type.
 */
type InferTupleItems<T extends readonly FieldDef[], D extends number> = {
	[K in keyof T]: T[K] extends FieldDef ? InferFieldDef<T[K], D> : never;
};

/**
 * Infers the tagged-object union for a discriminated field spec.
 */
type InferDiscriminated<F extends DiscriminatedFieldSpec> = {
	[K in keyof F["variants"]]: ShapeOf<F["variants"][K]> & {
		[D in F["discriminant"]]: K;
	};
}[keyof F["variants"]];

/**
 * Adds `| null` when the field spec sets `nullable: true`.
 */
type ApplyNullable<F extends FieldDef, T> = F extends { nullable: true }
	? T | null
	: T;

/**
 * Infers the TypeScript type for a single `FieldDef`.
 */
type InferFieldDef<F extends FieldDef, D extends number = 8> = D extends never
	? unknown
	: ApplyNullable<F, InferFieldDefBase<F, D>>;

/**
 * Derives a TypeScript type from a field spec record.
 *
 * When `S` is `false` (the default) the result is intersected with
 * `Record<string, unknown>` so extra fields are permitted.
 * When `S` is `true` (strict mode) only declared fields are present.
 */
export type ShapeOf<
	F extends Record<string, FieldDef>,
	S extends boolean = false,
> = {
	[K in keyof F as IsOptional<F[K]> extends true ? never : K]: InferFieldDef<
		F[K]
	>;
} & {
	[K in keyof F as IsOptional<F[K]> extends true ? K : never]?: InferFieldDef<
		F[K]
	>;
} & (S extends true ? unknown : Record<string, unknown>);

/**
 * Determines whether a field def is marked optional.
 */
type IsOptional<F extends FieldDef> = F extends { optional: true }
	? true
	: false;

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
 * Formats an unknown value for validation issue messages without
 * relying on Object default stringification.
 */
function describeValue(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number") {
		return value.toString();
	}
	if (typeof value === "boolean") {
		if (value) {
			return "true";
		}

		return "false";
	}
	if (typeof value === "bigint") {
		return value.toString();
	}
	if (typeof value === "symbol") {
		return value.toString();
	}
	if (typeof value === "function") {
		return "function";
	}

	return typeof value;
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
	extras?: { expected?: string; value?: unknown },
): ValidationIssue {
	const issue: ValidationIssue = {
		path,
		code,
		message: describeFailure(path, detail),
	};

	if (!extras) {
		return issue;
	}

	return { ...issue, ...extras };
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

		let cont = true;
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
function matches(
	value: unknown,
	spec: FieldSpec,
	path: string,
	strict: boolean,
): boolean {
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
				value: current.value,
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

		if (!(key in current.value)) {
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
		if (key in current.fields) {
			continue;
		}

		const fieldPath = childPath(current.path, key);
		const ok = noteIssue(
			ctx,
			makeIssue(fieldPath, "unexpected", "is not allowed", {
				value: Reflect.get(current.value, key),
			}),
		);
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
				value: null,
			}),
		);
	}

	let ok = true;

	if (
		current.spec.type === "string" ||
		current.spec.type === "number" ||
		current.spec.type === "boolean"
	) {
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
	} else if (current.spec.type === "literal") {
		ok = processLiteral(ctx, current, current.spec);
	} else if (current.spec.type === "union") {
		ok = processUnion(ctx, current, current.spec);
	} else if (current.spec.type === "discriminated") {
		ok = processDiscriminated(ctx, current, current.spec);
	} else {
		return noteIssue(
			ctx,
			makeIssue(current.path, "spec", "has an unknown field spec type"),
		);
	}

	if (!ok) {
		return false;
	}

	return applyRefine(ctx, current.path, current.value, current.spec);
}

/**
 * Runs an optional `refine` predicate after structural checks.
 */
function applyRefine(
	ctx: ValidateCtx,
	path: string,
	value: unknown,
	spec: FieldSpec,
): boolean {
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

	return noteIssue(ctx, makeIssue(path, "refine", detail, { value }));
}

/**
 * Primitive typeof check plus number/string constraints.
 */
function processPrimitive(ctx: ValidateCtx, current: FieldWorkItem): boolean {
	const spec = current.spec;
	if (
		spec.type !== "string" &&
		spec.type !== "number" &&
		spec.type !== "boolean"
	) {
		return true;
	}

	if (typeof current.value !== spec.type) {
		return noteIssue(
			ctx,
			makeIssue(
				current.path,
				"type",
				`must be ${spec.type}, got ${typeof current.value}`,
				{
					expected: spec.type,
					value: current.value,
				},
			),
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
function processNumberConstraints(
	ctx: ValidateCtx,
	path: string,
	value: number,
	spec: PrimitiveFieldSpec,
): boolean {
	let ok = true;

	if (spec.integer && !Number.isInteger(value)) {
		ok = noteIssue(
			ctx,
			makeIssue(path, "type", "must be an integer", {
				expected: "integer",
				value,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (
		spec.exclusiveMinimum !== undefined &&
		!(value > spec.exclusiveMinimum)
	) {
		ok = noteIssue(
			ctx,
			makeIssue(
				path,
				"range",
				`must be greater than ${spec.exclusiveMinimum}`,
				{
					expected: `>${spec.exclusiveMinimum}`,
					value,
				},
			),
		);
		if (!ok) {
			return false;
		}
	}

	if (
		spec.exclusiveMaximum !== undefined &&
		!(value < spec.exclusiveMaximum)
	) {
		ok = noteIssue(
			ctx,
			makeIssue(
				path,
				"range",
				`must be less than ${spec.exclusiveMaximum}`,
				{
					expected: `<${spec.exclusiveMaximum}`,
					value,
				},
			),
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
				value,
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
				value,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	if (
		spec.multipleOf !== undefined &&
		!isMultipleOf(value, spec.multipleOf)
	) {
		ok = noteIssue(
			ctx,
			makeIssue(
				path,
				"range",
				`must be a multiple of ${spec.multipleOf}`,
				{
					expected: `multipleOf:${spec.multipleOf}`,
					value,
				},
			),
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
function processStringConstraints(
	ctx: ValidateCtx,
	path: string,
	value: string,
	spec: PrimitiveFieldSpec,
): boolean {
	let ok = true;
	const length = value.length;

	if (spec.minLength !== undefined && length < spec.minLength) {
		ok = noteIssue(
			ctx,
			makeIssue(
				path,
				"length",
				`must have length >= ${spec.minLength}, got ${length}`,
				{
					expected: `minLength:${spec.minLength}`,
					value,
				},
			),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.maxLength !== undefined && length > spec.maxLength) {
		ok = noteIssue(
			ctx,
			makeIssue(
				path,
				"length",
				`must have length <= ${spec.maxLength}, got ${length}`,
				{
					expected: `maxLength:${spec.maxLength}`,
					value,
				},
			),
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
				value,
			}),
		);
		if (!ok) {
			return false;
		}
	}

	return ok;
}

/**
 * Duck-type guard for decimal-like values (avoids importing `decimal.js`).
 */
function isDecimalLike(value: unknown): value is DecimalLike {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	if (!("isFinite" in value) || typeof value.isFinite !== "function") {
		return false;
	}
	if (!("gt" in value) || typeof value.gt !== "function") {
		return false;
	}
	if (!("lt" in value) || typeof value.lt !== "function") {
		return false;
	}
	if (
		!("decimalPlaces" in value) ||
		typeof value.decimalPlaces !== "function"
	) {
		return false;
	}
	if (!("precision" in value) || typeof value.precision !== "function") {
		return false;
	}
	if (!("toString" in value) || typeof value.toString !== "function") {
		return false;
	}

	return true;
}

/**
 * `decimal.js` constructor shape used after lazy peer load.
 */
type DecimalConstructor = new (value: string | number) => DecimalLike;

let cachedDecimalCtor: DecimalConstructor | undefined;
let cachedDecimalLoadError: Error | undefined;

/**
 * True when `value` is a constructable decimal constructor.
 */
function isDecimalConstructor(value: unknown): value is DecimalConstructor {
	return typeof value === "function";
}

/**
 * Resolves CJS / ESM interop shapes of the `decimal.js` export.
 */
function resolveDecimalExport(mod: unknown): DecimalConstructor | undefined {
	if (isDecimalConstructor(mod)) {
		return mod;
	}
	if (typeof mod !== "object" || mod === null) {
		return undefined;
	}
	if (!("default" in mod)) {
		return undefined;
	}

	const def = mod.default;
	if (isDecimalConstructor(def)) {
		return def;
	}

	return undefined;
}

/**
 * Constructor shape for lazy `InvariantError` load.
 */
type InvariantErrorConstructor = new (
	code: string,
	message: string,
	cause?: unknown,
) => Error;

/**
 * Narrows an unknown export to an invariant error constructor.
 */
function isInvariantErrorConstructor(
	value: unknown,
): value is InvariantErrorConstructor {
	return typeof value === "function";
}

/**
 * Lazy-loads `InvariantError` to avoid a circular init with `coded-error`.
 */
function makeInvariant(code: string, message: string, cause?: unknown): Error {
	const require = createRequire(import.meta.url);
	const mod: unknown = require("./errors/invariant-error.js");
	if (typeof mod === "object" && mod !== null && "InvariantError" in mod) {
		const Ctor = mod.InvariantError;
		if (isInvariantErrorConstructor(Ctor)) {
			return new Ctor(code, message, cause);
		}
	}

	const fallback = new Error(message);
	fallback.name = "InvariantError";
	fallback.cause = cause;

	return fallback;
}

/**
 * Lazily loads optional peer `decimal.js`. Throws when missing/invalid.
 */
function loadDecimalConstructor(): DecimalConstructor {
	if (cachedDecimalCtor) {
		return cachedDecimalCtor;
	}
	if (cachedDecimalLoadError) {
		throw cachedDecimalLoadError;
	}

	const require = createRequire(import.meta.url);
	let mod: unknown;
	try {
		mod = require("decimal.js");
	} catch (cause) {
		cachedDecimalLoadError = makeInvariant(
			"DECIMAL_PEER_MISSING",
			'Optional peer "decimal.js" is required when validating { type: "decimal" } fields. Install decimal.js.',
			cause,
		);
		throw cachedDecimalLoadError;
	}

	const ctor = resolveDecimalExport(mod);
	if (!ctor) {
		cachedDecimalLoadError = makeInvariant(
			"DECIMAL_PEER_INVALID",
			'Optional peer "decimal.js" did not export a Decimal constructor.',
		);
		throw cachedDecimalLoadError;
	}

	cachedDecimalCtor = ctor;
	return ctor;
}

/**
 * Parses a decimal input. Returns `null` when the value is not accepted.
 */
function parseDecimalInput(
	value: unknown,
	allowNumber: boolean,
): DecimalLike | null {
	if (isDecimalLike(value)) {
		if (!value.isFinite()) {
			return null;
		}

		return value;
	}

	if (typeof value === "string") {
		const Decimal = loadDecimalConstructor();
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

		const Decimal = loadDecimalConstructor();
		return new Decimal(value);
	}

	return null;
}

/**
 * Coerces a bound into a finite decimal, or `null` when invalid.
 */
function toDecimalBound(bound: string | DecimalLike): DecimalLike | null {
	if (isDecimalLike(bound)) {
		if (!bound.isFinite()) {
			return null;
		}

		return bound;
	}

	const Decimal = loadDecimalConstructor();
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
function decimalTotalDigits(value: DecimalLike): number {
	return value.precision();
}

/**
 * Decimal type, bounds, and digit constraints.
 */
function processDecimal(
	ctx: ValidateCtx,
	current: FieldWorkItem,
	spec: DecimalFieldSpec,
): boolean {
	let allowNumber = false;
	if (spec.allowNumber) {
		allowNumber = true;
	}

	const parsed = parseDecimalInput(current.value, allowNumber);
	if (!parsed) {
		return noteIssue(
			ctx,
			makeIssue(
				current.path,
				"type",
				"must be a decimal (Decimal or numeric string)",
				{
					expected: "decimal",
					value: current.value,
				},
			),
		);
	}

	let ok = true;

	if (spec.exclusiveMinimum !== undefined) {
		const bound = toDecimalBound(spec.exclusiveMinimum);
		if (bound && !parsed.gt(bound)) {
			ok = noteIssue(
				ctx,
				makeIssue(
					current.path,
					"range",
					`must be greater than ${bound.toString()}`,
					{
						expected: `>${bound.toString()}`,
						value: current.value,
					},
				),
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
				makeIssue(
					current.path,
					"range",
					`must be less than ${bound.toString()}`,
					{
						expected: `<${bound.toString()}`,
						value: current.value,
					},
				),
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
				makeIssue(
					current.path,
					"range",
					`must be >= ${bound.toString()}`,
					{
						expected: `>=${bound.toString()}`,
						value: current.value,
					},
				),
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
				makeIssue(
					current.path,
					"range",
					`must be <= ${bound.toString()}`,
					{
						expected: `<=${bound.toString()}`,
						value: current.value,
					},
				),
			);
			if (!ok) {
				return false;
			}
		}
	}

	if (
		spec.fractionDigits !== undefined &&
		parsed.decimalPlaces() > spec.fractionDigits
	) {
		ok = noteIssue(
			ctx,
			makeIssue(
				current.path,
				"range",
				`must have at most ${spec.fractionDigits} fraction digits`,
				{
					expected: `fractionDigits:${spec.fractionDigits}`,
					value: current.value,
				},
			),
		);
		if (!ok) {
			return false;
		}
	}

	if (
		spec.totalDigits !== undefined &&
		decimalTotalDigits(parsed) > spec.totalDigits
	) {
		ok = noteIssue(
			ctx,
			makeIssue(
				current.path,
				"range",
				`must have at most ${spec.totalDigits} significant digits`,
				{
					expected: `totalDigits:${spec.totalDigits}`,
					value: current.value,
				},
			),
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
function processUniqueItems(
	ctx: ValidateCtx,
	path: string,
	values: readonly unknown[],
): boolean {
	const seen = new Set<unknown>();
	for (let i = 0; i < values.length; i++) {
		const item = values[i];
		if (seen.has(item)) {
			const ok = noteIssue(
				ctx,
				makeIssue(
					`${path}[${i}]`,
					"unique",
					"must be unique within the array",
					{ value: item },
				),
			);
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
function processArray(
	ctx: ValidateCtx,
	current: FieldWorkItem,
	spec: ArrayFieldSpec,
): boolean {
	if (!Array.isArray(current.value)) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be an array", {
				expected: "array",
				value: current.value,
			}),
		);
	}

	const length = current.value.length;
	if (spec.minItems !== undefined && length < spec.minItems) {
		const ok = noteIssue(
			ctx,
			makeIssue(
				current.path,
				"length",
				`must have at least ${spec.minItems} items, got ${length}`,
				{
					expected: `minItems:${spec.minItems}`,
					value: length,
				},
			),
		);
		if (!ok) {
			return false;
		}
	}

	if (spec.maxItems !== undefined && length > spec.maxItems) {
		const ok = noteIssue(
			ctx,
			makeIssue(
				current.path,
				"length",
				`must have at most ${spec.maxItems} items, got ${length}`,
				{
					expected: `maxItems:${spec.maxItems}`,
					value: length,
				},
			),
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
function processTuple(
	ctx: ValidateCtx,
	current: FieldWorkItem,
	spec: TupleFieldSpec,
): boolean {
	if (!Array.isArray(current.value)) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be a tuple", {
				expected: "tuple",
				value: current.value,
			}),
		);
	}

	const expectedLength = spec.items.length;
	if (current.value.length !== expectedLength) {
		const ok = noteIssue(
			ctx,
			makeIssue(
				current.path,
				"length",
				`must have length ${expectedLength}, got ${current.value.length}`,
				{
					expected: `length:${expectedLength}`,
					value: current.value.length,
				},
			),
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
 * Literal membership check.
 */
function processLiteral(
	ctx: ValidateCtx,
	current: FieldWorkItem,
	spec: LiteralFieldSpec,
): boolean {
	for (const allowed of spec.values) {
		if (current.value === allowed) {
			return true;
		}
	}

	const expected = spec.values.join(", ");
	return noteIssue(
		ctx,
		makeIssue(
			current.path,
			"literal",
			`must be one of [${expected}], got ${describeValue(current.value)}`,
			{
				expected: `[${expected}]`,
				value: current.value,
			},
		),
	);
}

/**
 * First-matching union arm (probe via iterative bail matches).
 */
function processUnion(
	ctx: ValidateCtx,
	current: FieldWorkItem,
	spec: UnionFieldSpec,
): boolean {
	for (const arm of spec.of) {
		const armSpec = normalizeSpec(arm);
		if (matches(current.value, armSpec, current.path, ctx.strict)) {
			return true;
		}
	}

	return noteIssue(
		ctx,
		makeIssue(current.path, "union", "does not match any union variant", {
			value: current.value,
		}),
	);
}

/**
 * Discriminant-selected object variant; enqueues object work.
 */
function processDiscriminated(
	ctx: ValidateCtx,
	current: FieldWorkItem,
	spec: DiscriminatedFieldSpec,
): boolean {
	if (!isRecord(current.value)) {
		return noteIssue(
			ctx,
			makeIssue(current.path, "type", "must be an object", {
				expected: "object",
				value: current.value,
			}),
		);
	}

	const disc = spec.discriminant;
	const tag: unknown = Reflect.get(current.value, disc);
	const discPath = childPath(current.path, disc);

	if (typeof tag !== "string") {
		return noteIssue(
			ctx,
			makeIssue(
				discPath,
				"discriminant",
				"must be a string discriminant",
				{ expected: "string", value: tag },
			),
		);
	}

	const variant = spec.variants[tag];
	if (variant === undefined) {
		return noteIssue(
			ctx,
			makeIssue(
				discPath,
				"unknown_variant",
				`has unknown variant ${tag}`,
				{ value: tag },
			),
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
 * Predicate guard: returns `true` when `value` conforms to the spec.
 *
 * Extra fields beyond the spec are permitted.
 */
export function isShape<F extends Record<string, FieldDef>>(
	value: unknown,
	fields: F,
): value is ShapeOf<F> {
	const issues = validateObject(value, fields, false);
	return issues.length === 0;
}

/**
 * Discriminated result of a non-throwing shape validation.
 */
export type ShapeResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly issues: readonly ValidationIssue[] };

/**
 * Narrows `value` when `issues` is empty. Used so {@link tryShape}
 * can return a typed value without a type assertion.
 */
function isValidatedShape<F extends Record<string, FieldDef>>(
	value: unknown,
	_fields: F,
	issues: readonly ValidationIssue[],
): value is ShapeOf<F> {
	return issues.length === 0;
}

/**
 * Narrows `value` when `issues` is empty under strict mode.
 */
function isValidatedStrictShape<F extends Record<string, FieldDef>>(
	value: unknown,
	_fields: F,
	issues: readonly ValidationIssue[],
): value is ShapeOf<F, true> {
	return issues.length === 0;
}

/**
 * Validates without throwing. Returns the narrowed value or all issues.
 *
 * Extra fields beyond the spec are permitted.
 */
export function tryShape<F extends Record<string, FieldDef>>(
	value: unknown,
	fields: F,
): ShapeResult<ShapeOf<F>> {
	const issues = validateObject(value, fields, false);
	if (!isValidatedShape(value, fields, issues)) {
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
	if (!isValidatedStrictShape(value, fields, issues)) {
		return { ok: false, issues };
	}

	return { ok: true, value };
}
