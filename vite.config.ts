import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
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

export default defineConfig(() => {
  const branch = deploymentBranch();
  const vercelEnv = process.env.VERCEL_ENV || "";

  return {
    plugins: [react(), tailwindcss()],
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    define: {
      "import.meta.env.VITE_GIT_BRANCH": JSON.stringify(branch),
      "import.meta.env.VITE_VERCEL_ENV": JSON.stringify(vercelEnv),
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
