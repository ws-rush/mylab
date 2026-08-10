import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isRootUrl(url = '') {
  return url === '/' || url.startsWith('/?');
}

function isPlayPreviewRoute(url = '') {
  return url === '/play' || url.startsWith('/play?') || url.startsWith('/play/');
}

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
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const { url = '' } = req;
          if (isRootUrl(url)) {
            res.writeHead(302, { Location: '/play/' });
            res.end();
            return;
          }
          if (isPlayPreviewRoute(url)) req.url = '/play/index.html';
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

        let html = fs.readFileSync(targetIndexHtml, 'utf8');

        // 1. Inline the CSS into the HTML to eliminate a render-blocking
        //    request.  The stylesheet is small (~2.5 KB gzipped) so inlining
        //    removes a full round-trip on mobile networks.
        const cssMatch = html.match(/<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
        if (cssMatch) {
          const cssPath = path.join(distDir, cssMatch[1].replace(/^\//, ''));
          if (fs.existsSync(cssPath)) {
            html = html.replace(cssMatch[0], `<style>\n${fs.readFileSync(cssPath, 'utf8')}\n</style>`);
            fs.rmSync(cssPath);
          }
        }

        fs.writeFileSync(targetIndexHtml, html);

        // SPA rewrite rule for Cloudflare Pages
        fs.writeFileSync(path.join(distDir, '_redirects'), `/play/*  /play/index.html  200\n`);
      },
    },
  ],
});
