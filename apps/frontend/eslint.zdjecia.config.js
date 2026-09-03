import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Osobna, wąska konfiguracja: WYŁĄCZNIE zakaz surowego zdjęcia miejsca.
 *
 * Pełny `npm run lint` zgłasza dziś 264 błędy zaległe, więc wpięcie go w build
 * zablokowałoby każde wdrożenie. Ta konfiguracja sprawdza jedną rzecz, która
 * już dwa razy weszła na produkcję i dwa razy kosztowała dziesiątki megabajtów
 * transferu na jedno wejście — dzięki temu może realnie zatrzymać build.
 *
 * 03.09.2026 — zdjęty zakaz surowych kolorów palety Tailwinda. Wygląd idzie do
 * przebudowy i reguła opisująca poprzedni kierunek blokowałaby ją jako pierwsza.
 * Zakaz zdjęcia bez miniatury ZOSTAJE, bo to nie jest reguła estetyczna: pełne
 * zdjęcie wysłane do przeglądarki jest błędem przy każdym designie.
 * Stara reguła siedzi w historii gita, gdyby miała wrócić.
 */
export default tseslint.config(
  { ignores: ["dist"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/Zdjecie.tsx", "src/lib/zdjecia.ts",
              // Kreator v2 to celowo ciemny interfejs poza zakresem
              // redesignu „Wyprawa" — nie udajemy, że jest inaczej.
              "src/pages/v2/**"],
    languageOptions: { parser: tseslint.parser, ecmaVersion: 2020 },
    // Wtyczka jest tu tylko po to, żeby nazwy reguł z komentarzy `eslint-disable`
    // rozsianych po kodzie dawały się rozwiązać. Sama reguła zostaje wyłączona —
    // ta konfiguracja pilnuje jednej rzeczy i nie udaje pełnego lintera.
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='img'] > JSXAttribute[name.name='src'] > JSXExpressionContainer:not(:has(CallExpression[callee.name='miniatura'])) MemberExpression[property.name=/^(photos|image_url|zdjecia)$/]",
          message:
            'Zdjęcie miejsca bez miniatury: użyj <Zdjecie src={...} gdzie="kafelek" /> albo miniatura(src, SZEROKOSC.kafelek).',
        },
      ],
    },
  },
);
