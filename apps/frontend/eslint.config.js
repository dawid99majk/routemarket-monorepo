import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Zdjęcia miejsc idą przez <Zdjecie> albo przez miniatura(). Surowy adres
      // z bazy to oryginał z Wikimediów -- pojedyncze pliki mają po kilkanaście
      // megabajtów i lądują w kafelku szerokim na 300 px.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='img'] > JSXAttribute[name.name='src'] > JSXExpressionContainer:not(:has(CallExpression[callee.name='miniatura'])) MemberExpression[property.name=/^(photos|image_url|zdjecia)$/]",
          message:
            "Zdjęcie miejsca bez miniatury: użyj <Zdjecie src={...} gdzie=\"kafelek\" /> albo miniatura(src, SZEROKOSC.kafelek).",
        },
      ],
    },
  },
  {
    // Sam komponent <Zdjecie> i pomocnik muszą móc użyć surowego <img>.
    files: ["src/components/Zdjecie.tsx", "src/lib/zdjecia.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
);
