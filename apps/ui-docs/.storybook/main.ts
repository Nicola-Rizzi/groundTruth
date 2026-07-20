import type { StorybookConfig } from "@storybook/react-vite";
import { resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.tsx"],
  addons: [],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@acme/ui": resolve(__dirname, "../../../packages/acme-ui/src/components/ui"),
    };
    return config;
  },
};

export default config;
