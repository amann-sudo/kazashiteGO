import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-nextの既定除外に、このプロジェクト固有の生成物を追加します。
  globalIgnores([
    // eslint-config-nextが既定で除外する生成物です。
    ".next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "worker-configuration.d.ts",
  ]),
]);

export default eslintConfig;
