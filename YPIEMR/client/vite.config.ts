import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const keyPath = path.resolve(__dirname, "../server/certs/dev-key.pem");
const certPath = path.resolve(__dirname, "../server/certs/dev-cert.pem");
const hasCerts = fs.existsSync(keyPath) && fs.existsSync(certPath);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    https: hasCerts ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) } : undefined,
    proxy: {
      // The backend falls back to plain HTTP on this same port when no TLS
      // certificate exists (see server/src/index.ts) — hardcoding https:
      // here broke local dev with ECONNREFUSED/SSL errors in that case,
      // since the proxy would try to speak TLS to a plain HTTP server.
      "/api": {
        target: hasCerts ? "https://localhost:8443" : "http://localhost:8443",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
