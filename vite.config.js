import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'play-route-setup',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/play' || req.url === '/play/' || req.url?.startsWith('/play?')) {
            req.url = '/index.html';
          }
          next();
        });
      },
      closeBundle() {
        const distDir = path.resolve(__dirname, 'dist');
        const playDir = path.join(distDir, 'play');
        const rootIndexHtml = path.join(distDir, 'index.html');
        const targetIndexHtml = path.join(playDir, 'index.html');

        fs.mkdirSync(playDir, { recursive: true });

        if (fs.existsSync(rootIndexHtml)) {
          fs.renameSync(rootIndexHtml, targetIndexHtml);
        }

        // SPA rewrite rule for Cloudflare Pages
        const redirectsContent = `/play/*  /play/index.html  200\n`;
        fs.writeFileSync(path.join(distDir, '_redirects'), redirectsContent);
      },
    },
  ],
});
