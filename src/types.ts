/**
 * Standalone type definitions with zero runtime cost.
 */

/**
 * Recursive JSON-safe value type.
 *
 * Represents any value that survives a JSON round-trip. Useful for
 * Prisma Json columns, API payloads, and serialization boundaries.
 */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| { [key: string]: JsonValue }
	| JsonValue[];
