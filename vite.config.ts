import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Inline weapon images so the app can also be shipped as a single HTML file.
  build: { assetsInlineLimit: 100_000_000 },
});
