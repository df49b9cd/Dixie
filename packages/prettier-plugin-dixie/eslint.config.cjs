const {
    defineConfig,
    globalIgnores,
} = require("eslint/config");

const tsParser = require("@typescript-eslint/parser");
const globals = require("globals");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        parser: tsParser,

        parserOptions: {
            tsconfigRootDir: __dirname,
            project: ["./tsconfig.eslint.json"],
        },

        globals: {
            ...globals.node,
        },
    },

    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    extends: compat.extends(
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "prettier",
    ),

    rules: {
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/explicit-module-boundary-types": "off",
    },
}, globalIgnores(["**/dist", "**/*.d.ts"])]);
