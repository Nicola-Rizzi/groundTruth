/**
 * Flags hardcoded hex color literals inside JSX style props and CSS-in-JS objects.
 * Use CSS variables instead: rgb(var(--token-name))
 *
 * Wrong:  style={{ color: "#B91C1C" }}
 * Right:  style={{ color: "rgb(var(--feedback-error))" }}
 */

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow hardcoded hex color literals. Use CSS variables derived from design tokens instead.",
      url: "https://github.com/your-org/groundtruth/blob/main/packages/eslint-plugin-acme/rules/no-hardcoded-colors.js",
    },
    messages: {
      noHardcodedColor:
        "Hardcoded color \"{{ value }}\". Use a CSS variable instead: rgb(var(--<token>)). " +
        "Run `list_tokens` in the MCP to find the right token.",
    },
    schema: [],
  },

  create(context) {
    function checkLiteral(node) {
      if (node.type === "Literal" && typeof node.value === "string" && HEX_RE.test(node.value)) {
        context.report({
          node,
          messageId: "noHardcodedColor",
          data: { value: node.value },
        });
      }
    }

    return {
      // style={{ color: "#fff" }} and className={{ color: "#fff" }}
      JSXExpressionContainer(node) {
        walkNode(node.expression, checkLiteral);
      },
      // Template literals: `color: #fff`
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          if (HEX_RE.test(quasi.value.raw)) {
            context.report({
              node: quasi,
              messageId: "noHardcodedColor",
              data: { value: quasi.value.raw.match(HEX_RE)?.[0] ?? "" },
            });
          }
        }
      },
    };
  },
};

function walkNode(node, visitor) {
  if (!node) return;
  visitor(node);
  if (node.type === "ObjectExpression") {
    for (const prop of node.properties) {
      walkNode(prop.value, visitor);
    }
  } else if (node.type === "ArrayExpression") {
    for (const el of node.elements) {
      walkNode(el, visitor);
    }
  } else if (node.type === "ConditionalExpression") {
    walkNode(node.consequent, visitor);
    walkNode(node.alternate, visitor);
  }
}
