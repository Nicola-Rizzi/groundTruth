import noHardcodedColors from "./rules/no-hardcoded-colors.js";

const plugin = {
  meta: {
    name: "@acme/eslint-plugin",
    version: "1.0.0",
  },
  rules: {
    "no-hardcoded-colors": noHardcodedColors,
  },
};

export default plugin;
