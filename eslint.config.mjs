import { defineConfig } from "eslint/config";
import base from "@wahidgroup/lint-rules/eslint/base";
import strict from "@wahidgroup/lint-rules/eslint/strict";

export default defineConfig(...base, ...strict, {
	languageOptions: {
		parserOptions: {
			projectService: {
				allowDefaultProject: ["eslint.config.mjs", "prettier.config.mjs"],
			},
			tsconfigRootDir: import.meta.dirname,
		},
	},
});
