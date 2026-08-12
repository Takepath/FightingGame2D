import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    open: false,
    allowedHosts: ["kudos-audible-pending.ngrok-free.dev"],
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
