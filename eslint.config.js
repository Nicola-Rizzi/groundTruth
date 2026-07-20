import acmePlugin from "@acme/eslint-plugin";

export default [
  {
    plugins: {
      "@acme": acmePlugin,
    },
    rules: {
      "@acme/no-hardcoded-colors": "error",
    },
    files: ["apps/**/*.{ts,tsx}", "packages/acme-ui/src/**/*.{ts,tsx}"],
  },
];
