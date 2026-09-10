import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function deploymentBranch() {
  return (
    process.env.VITE_GIT_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_REF_NAME ||
    ""
  ).trim();
}

function appVersion() {
  return (
    process.env.VITE_APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    `local-${Date.now()}`
  ).trim();
}

function frontendVersionPlugin(version: string): Plugin {
  return {
    name: "fccd-frontend-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "app-version.json",
        source: JSON.stringify({ version }),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isTest = mode === "test" || process.env.VITEST === "true";
  // Tests always resolve to the develop Supabase project (never main).
  const branch = isTest ? "develop" : deploymentBranch();
  const vercelEnv = isTest ? "preview" : (process.env.VERCEL_ENV || "");
  const version = isTest ? "test" : appVersion();

  return {
    plugins: [react(), tailwindcss(), frontendVersionPlugin(version)],
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    define: {
      "import.meta.env.VITE_GIT_BRANCH": JSON.stringify(branch),
      "import.meta.env.VITE_VERCEL_ENV": JSON.stringify(vercelEnv),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
