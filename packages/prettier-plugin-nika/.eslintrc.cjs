module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.eslint.json"]
  },
  env: {
    node: true,
    es2021: true
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  ignorePatterns: ["dist", "*.d.ts"],
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/explicit-module-boundary-types": "off"
  }
};
