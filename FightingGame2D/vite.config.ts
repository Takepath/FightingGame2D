import { defineConfig } from "vite";

import { assetpackPlugin } from "./scripts/assetpack-vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [assetpackPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    open: false,
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
