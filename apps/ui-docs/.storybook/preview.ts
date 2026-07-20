import type { Preview } from "@storybook/react";
import "../../../packages/acme-ui/src/index.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};

export default preview;
