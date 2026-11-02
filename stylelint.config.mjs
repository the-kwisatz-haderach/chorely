// Components use semantic tokens only; raw colours and the palette layer live in tokens.css (ADR 0005).
const RAW_COLOUR_FUNCTIONS = ["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color"];

export default {
  ignoreFiles: ["**/node_modules/**", "**/.next/**", "**/test-results/**", "**/playwright-report/**"],
  rules: {
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": RAW_COLOUR_FUNCTIONS,
    "declaration-property-value-disallowed-list": [
      { "/.*/": ["/var\\(\\s*--palette-/"] },
      { message: "Use a semantic --color-* token; --palette-* is only for tokens.css (ADR 0005)." },
    ],
  },
  overrides: [
    {
      files: ["**/tokens.css"],
      rules: {
        "color-no-hex": null,
        "color-named": null,
        "function-disallowed-list": null,
        "declaration-property-value-disallowed-list": null,
      },
    },
  ],
};
