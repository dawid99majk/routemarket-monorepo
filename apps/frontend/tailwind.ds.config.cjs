// Konfiguracja Tailwinda wyłącznie na potrzeby synchronizacji systemu projektowego.
// Zawartość obejmuje komponenty ui/ ORAZ autorskie podglądy — bez tego klasy użyte
// w podglądach nie trafiłyby do arkusza i karty renderowałyby się bez stylów.
const base = require('./tailwind.config.ts');
const cfg = base.default || base;
module.exports = {
  ...cfg,
  content: [
    './src/components/ui/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
    '../../.design-sync/previews/**/*.{ts,tsx}',
  ],
};
