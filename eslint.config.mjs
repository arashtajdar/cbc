import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";

export default [
    js.configs.recommended,
    eslintConfigPrettier,
    eslintPluginPrettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                THREE: "readonly",
                engine: "writable",
                minigamesRegistry: "readonly",
                window: "readonly",
                document: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                Math: "readonly",
                requestAnimationFrame: "readonly",
                cancelAnimationFrame: "readonly",
                localStorage: "readonly",
                CustomEvent: "readonly",
                renderArenaSelectionGrid: "writable"
            }
        },
        rules: {
            "prettier/prettier": "warn",
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "no-undef": "error"
        }
    }
];
