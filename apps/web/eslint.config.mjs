// ESLint flat config (ESLint 9 / Next.js 16).
// Next 16 eliminó `next lint`; se usa el CLI de ESLint con el flat config
// que exporta eslint-config-next (incluye core-web-vitals + typescript).
import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
