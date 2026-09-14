/* ------------------------------------------------------------------ */
/*  @wahidgroup/clay                                                  */
/*                                                                    */
/*  Framework-agnostic runtime typing: guards, shape validation,      */
/*  and a standardized coded-error hierarchy.                         */
/* ------------------------------------------------------------------ */

export {
	CodedError,
	InternalError,
	InvariantError,
	UserError,
	UserValidationError,
	ValidationError,
	errorMessage,
} from "./errors/index.js";
export {
	assertNever,
	hasProperties,
	isArray,
	isArrayOf,
	isBoolean,
	isDefined,
	isError,
	isFiniteNumber,
	isNonEmptyString,
	isNonNull,
	isNumber,
	isOneOf,
	isPlainRecord,
	isRecord,
	isString,
	isSystemError,
} from "./guards.js";
export {
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
export { Decimal, isShape, tryShape, tryStrictShape } from "./shape.js";
export {
	asShape,
	asStrictShape,
	assertShape,
	assertStrictShape,
	createShape,
	createStrictShape,
} from "./shape-assert.js";

/* ------------------------------------------------------------------ */
/*  Type exports                                                       */
/* ------------------------------------------------------------------ */

export type { ValidationIssue, ValidationIssueCode } from "./errors/index.js";
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
	ShapeResult,
	TupleFieldSpec,
	UnionFieldSpec,
} from "./shape.js";
export type { ShapeValidator } from "./shape-assert.js";
export type { JsonValue } from "./types.js";
