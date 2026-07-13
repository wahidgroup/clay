/**
 * Field-spec types and `ShapeOf` inference for shape validation.
 *
 * Kept separate from the runtime engine so type consumers can import
 * specs without loading the validation implementation.
 */

import { Decimal } from "decimal.js";

export { Decimal };

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
 * A field whose value must be an exact decimal.
 *
 * Accepts `Decimal` instances and numeric strings by default.
 * Bare `number` is rejected unless `allowNumber` is `true`
 * (IEEE-754 binary floats are unsafe for exact quantities).
 *
 * Coercion uses the bundled `decimal.js` dependency.
 */
export interface DecimalFieldSpec extends HasRefine {
	readonly type: "decimal";
	readonly optional?: boolean;
	readonly nullable?: boolean;
	readonly allowNumber?: boolean;
	readonly minimum?: string | Decimal;
	readonly maximum?: string | Decimal;
	readonly exclusiveMinimum?: string | Decimal;
	readonly exclusiveMaximum?: string | Decimal;
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
			? Decimal
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
