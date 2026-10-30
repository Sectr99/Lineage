import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// CSP only on the production build: the dev server needs inline scripts and websockets for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // 'self' because Cloudflare's font optimization serves Google Fonts from the site's own /cf-fonts/ path.
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "csp",
      apply: "build",
      transformIndexHtml: html =>
        html.replace("<head>", `<head>\n  <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  ],
});
