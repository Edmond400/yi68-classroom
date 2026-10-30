import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Independent Cloudflare account deployment. No Sites identity or platform login.
export default defineConfig({
  server: { allowedHosts: ['terminal.local'] },
  plugins: [
    vinext(),
    cloudflare({
      configPath: "./wrangler.json",
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }),
  ],
});
