import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    open: false,
    allowedHosts: ["kudos-audible-pending.ngrok-free.dev"],
    // ngrokでは画面とWebSocketを同じ公開URLへ集約する。
    proxy: {
      "/room": {
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
    },
  },
});
