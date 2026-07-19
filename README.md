# clay

**Mold unknown into typed.**

Shape specs, type inference, coded errors.

```typescript
import { createShape } from "@wahidgroup/clay";

const User = createShape({
	name: "string",
	age: { type: "number", integer: true, minimum: 0, optional: true },
	nickname: { type: "string", nullable: true },
} as const);

const user = User.as(payload);
// user.name: string
// user.age?: number
// user.nickname: string | null
```

## Install

```bash
npm install @wahidgroup/clay
```

## Mold a form

`createShape` -> `is` / `try` / `assert` / `as`:

```typescript
import { createShape } from "@wahidgroup/clay";

const User = createShape({
	name: "string",
	age: { type: "number", optional: true },
	nickname: { type: "string", nullable: true },
	tags: { type: "array", items: "string", minItems: 0, maxItems: 20 },
	address: {
		type: "object",
		shape: { city: "string", zip: "string" },
	},
	role: { type: "literal", values: ["admin", "user"] as const },
} as const);

if (User.is(payload)) {
	/* narrowed */
}

const result = User.try(payload);
if (result.ok) {
	/* result.value */
} else {
	/* result.issues */
}

User.assert(payload); // throws ValidationError
const user = User.as(payload);
```

`optional` = omit. `nullable` = `null`. Not the same.

Flat helpers: `isShape`, `tryShape`, `asShape`, `assertShape` (+ strict variants). See [API](#api).

## Strict forms

Extra keys fail:

```typescript
import { createStrictShape } from "@wahidgroup/clay";

const WireUser = createStrictShape({
	name: "string",
} as const);

WireUser.assert(payload);
```

## Constraints

```typescript
import { createShape } from "@wahidgroup/clay";

const Profile = createShape({
	age: {
		type: "number",
		integer: true,
		minimum: 0,
		maximum: 120,
		multipleOf: 1,
	},
	code: {
		type: "string",
		minLength: 2,
		maxLength: 8,
		pattern: /^[A-Z]+$/,
	},
} as const);
```

## Advanced specs

Union, discriminated, decimal, refine:

```typescript
import { createShape, Decimal } from "@wahidgroup/clay";

const Payment = createShape({
	status: {
		type: "union",
		of: ["string", { type: "literal", values: [0, 1] as const }],
	},
	event: {
		type: "discriminated",
		discriminant: "kind",
		variants: {
			click: { x: "number", y: "number" },
			navigate: { url: "string" },
		},
	},
	amount: {
		type: "decimal",
		minimum: "0",
		fractionDigits: 2,
	},
	memo: {
		type: "string",
		maxLength: 120,
		refine: (v) => typeof v === "string" && !v.includes("<"),
		refineMessage: "must not contain markup",
	},
} as const);

Payment.is({
	status: "ok",
	event: { kind: "navigate", url: "/home" },
	amount: "12.50",
	memo: "thanks",
});

Payment.is({
	status: 1,
	event: { kind: "click", x: 1, y: 2 },
	amount: new Decimal("12.50"),
	memo: "thanks",
});
```

`decimal` ships with `decimal.js`. Bare `number` off unless `allowNumber: true`. Works in browser and Node.

Tree-shake-friendly imports: `@wahidgroup/clay/guards`, `@wahidgroup/clay/errors` (no shape / decimal load). Package ships `sideEffects: false`.

## Type guards

```typescript
import { isString, isRecord, hasProperties, isOneOf } from "@wahidgroup/clay";

if (isString(value)) {
	/* string */
}

if (isRecord(value)) {
	/* Record<string, unknown> - no arrays/null */
}

if (hasProperties(value, "id", "name")) {
	/* Record<"id" | "name", unknown> */
}

const statuses = ["active", "inactive"] as const;
if (isOneOf(value, statuses)) {
	/* "active" | "inactive" */
}
```

## Errors

`CodedError` base: `kind` + `code`, `isInstance`, `toJSON`.

```typescript
import { UserError, InternalError } from "@wahidgroup/clay";

throw new UserError("INVALID_EMAIL", "Email format is invalid");
throw new InternalError("DB_TIMEOUT", "Connection timed out", cause);
```

```typescript
if (UserError.isInstance(err)) {
	/* err.kind === "E_USER" */
}

if (InternalError.isInstance(err)) {
	/* err.kind === "E_INTERNAL" */
}
```

### ValidationError

`assert` / `as` failure. All issues kept:

```typescript
import { createShape, ValidationError } from "@wahidgroup/clay";

const User = createShape({ name: "string" } as const);

try {
	User.assert(value);
} catch (err) {
	if (ValidationError.isInstance(err)) {
		for (const issue of err.issues) {
			console.log(`${issue.path}: ${issue.message}`);
		}
	}
}
```

### UserValidationError

Redacts sensitive strings from messages / issue values:

```typescript
import { UserValidationError } from "@wahidgroup/clay";

throw new UserValidationError(
	"REGISTRATION",
	issues,
	["p@ssw0rd"],
	"Registration failed",
);
```

### errorMessage

```typescript
import { errorMessage } from "@wahidgroup/clay";

try {
	riskyOperation();
} catch (err) {
	log(errorMessage(err));
}
```

## Docs words

| Word | Means                  |
| ---- | ---------------------- |
| mold | `asShape` / `Form.as`  |
| form | field spec / `ShapeOf` |

## API

### Values

| Export                | Module         | What                         |
| --------------------- | -------------- | ---------------------------- |
| `isString`            | `guards`       | -> `string`                  |
| `isNumber`            | `guards`       | -> `number`                  |
| `isBoolean`           | `guards`       | -> `boolean`                 |
| `isNonNull`           | `guards`       | not null/undefined           |
| `isDefined`           | `guards`       | not undefined                |
| `isArray`             | `guards`       | -> `unknown[]`               |
| `isError`             | `guards`       | -> `Error`                   |
| `isRecord`            | `guards`       | -> `Record<string, unknown>` |
| `hasProperties`       | `guards`       | keys present                 |
| `isOneOf`             | `guards`       | literal union member         |
| `isSystemError`       | `guards`       | `Error` + `code`             |
| `assertNever`         | `guards`       | exhaustive check             |
| `isShape`             | `shape`        | soft predicate               |
| `tryShape`            | `shape`        | value or issues              |
| `tryStrictShape`      | `shape`        | strict try                   |
| `Decimal`             | `shape`        | re-export `decimal.js`       |
| `assertShape`         | `shape-assert` | throw on fail                |
| `assertStrictShape`   | `shape-assert` | strict assert                |
| `asShape`             | `shape-assert` | value or throw               |
| `asStrictShape`       | `shape-assert` | strict as                    |
| `createShape`         | `shape-assert` | `{ is, try, assert, as }`    |
| `createStrictShape`   | `shape-assert` | strict create                |
| `CodedError`          | `errors`       | `kind` / `code` base         |
| `UserError`           | `errors`       | user-facing                  |
| `InternalError`       | `errors`       | internal                     |
| `InvariantError`      | `errors`       | invariant break              |
| `ValidationError`     | `errors`       | shape issues                 |
| `UserValidationError` | `errors`       | redacted issues              |
| `errorMessage`        | `errors`       | message from unknown         |

### Types

| Export                   | Module         | What                                |
| ------------------------ | -------------- | ----------------------------------- |
| `PrimitiveType`          | `shape`        | `"string" \| "number" \| "boolean"` |
| `PrimitiveFieldSpec`     | `shape`        | primitive field                     |
| `DecimalFieldSpec`       | `shape`        | decimal field                       |
| `Decimal`                | `shape`        | re-export from `decimal.js`         |
| `ArrayFieldSpec`         | `shape`        | array + bounds                      |
| `TupleFieldSpec`         | `shape`        | fixed tuple                         |
| `ObjectFieldSpec`        | `shape`        | nested object                       |
| `LiteralFieldSpec`       | `shape`        | literal set                         |
| `UnionFieldSpec`         | `shape`        | first-match union                   |
| `DiscriminatedFieldSpec` | `shape`        | tagged variants                     |
| `FieldSpec`              | `shape`        | all structured specs                |
| `FieldDef`               | `shape`        | shorthand or spec                   |
| `ShapeOf`                | `shape`        | infer from fields                   |
| `ShapeResult`            | `shape`        | `{ ok, value }` / `{ ok, issues }`  |
| `ShapeValidator`         | `shape-assert` | compiled form                       |
| `ValidationIssue`        | `errors`       | path + message (+ optional extras)  |
| `ValidationIssueCode`    | `errors`       | issue code                          |
| `JsonValue`              | `types`        | JSON value                          |

## Dev

```
make setup        deps
make lint         lint + spell (fix=1)
make test         tests (debug=1)
make coverage     tests + Cobertura report (coverage/)
make build        dist/
make smoke        load dist exports
make spellcheck   cspell
make sbom         sbom.json (also shipped in npm pack)
make pack         assert npm pack is minimal + includes sbom
make ci           lint → build → coverage → smoke → pack
make release      VERSION=v0.2.0 [dry-run=1]
make clean-dist   wipe dist + artifacts + sbom.json
make clean        wipe dist + artifacts + sbom + node_modules
```

```bash
make release VERSION=v0.2.0
make release VERSION=v0.2.0 dry-run=1
```

## CI

- **PR Checks** - title, body, metadata
- **CI** - `make ci`, upload coverage + SBOM
- **Audit** - deps + weekly
- **Release** - tag `releases/v*` -> publish + attach SBOM

## Stack

TypeScript 5.9+, Vitest, ESLint 9, Prettier.
