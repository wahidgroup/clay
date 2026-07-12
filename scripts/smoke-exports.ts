/**
 * Smoke-load the built package entry. Fails if required exports are missing.
 */

import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const distEntry = path.join(root, "dist", "index.js");

try {
	await access(distEntry);
} catch {
	console.error("dist/index.js missing — run make build before smoke");
	process.exit(1);
}

const entry = pathToFileURL(distEntry).href;

const mod: unknown = await import(entry);
if (typeof mod !== "object" || mod === null) {
	console.error("dist entry did not export a module object");
	process.exit(1);
}

const required = [
	"isShape",
	"tryShape",
	"tryStrictShape",
	"asShape",
	"asStrictShape",
	"assertShape",
	"assertStrictShape",
	"createShape",
	"createStrictShape",
	"isString",
	"isRecord",
	"CodedError",
	"ValidationError",
	"UserValidationError",
	"InvariantError",
] as const;

let failed = false;
for (const name of required) {
	if (!(name in mod)) {
		console.error(`missing export: ${name}`);
		failed = true;
		continue;
	}

	console.log(`ok ${name}`);
}

if (failed) {
	process.exit(1);
}

console.log("smoke exports: all loaded");
