/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["next/core-web-vitals", "./base.js"],
  rules: {
    "@typescript-eslint/no-empty-object-type": "off",
  },
};
