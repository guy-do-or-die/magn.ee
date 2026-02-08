import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

// Custom plugin to strip crossorigin attributes from HTML (breaks extension popups)
function stripCrossOrigin() {
    return {
        name: 'strip-crossorigin',
        enforce: 'post' as const,
        transformIndexHtml(html: string) {
            return html.replace(/ crossorigin/g, '');
        }
    };
}

export default defineConfig({
    plugins: [
        react(),
        viteStaticCopy({
            targets: [
                { src: 'manifest.json', dest: '.' },
                { src: 'icons/*', dest: 'icons' }
            ]
        }),
        stripCrossOrigin()
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@magnee/ui': path.resolve(__dirname, '../packages/ui')
        }
    },
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // Disable module preload polyfill - not needed for extensions
        modulePreload: { polyfill: false },
        rollupOptions: {
            input: {
                // Settings popup (clicked from toolbar icon)
                settings: path.resolve(__dirname, 'settings.html'),
                // Intercept popup for transaction interception (opened by service worker)
                intercept: path.resolve(__dirname, 'src/ui/intercept.html'),
                serviceWorker: path.resolve(__dirname, 'src/background/serviceWorker.ts'),
                contentScript: path.resolve(__dirname, 'src/contentScript.ts'),
                providerWrapper: path.resolve(__dirname, 'src/injected/providerWrapper.ts')
            },
            output: {
                // Ensure consistent filenames for background/content scripts so manifest.json doesn't break
                entryFileNames: (chunkInfo) => {
                    // Popup JS is injected by index.html, so hash is fine/good there
                    if (chunkInfo.name === 'popup') return 'assets/[name]-[hash].js';

                    // For scripts referenced by manifest (bg, content, injected), use fixed names
                    // We output them mimicking the src structure
                    if (chunkInfo.name === 'serviceWorker') return 'src/background/serviceWorker.js';
                    if (chunkInfo.name === 'contentScript') return 'src/contentScript.js';
                    if (chunkInfo.name === 'providerWrapper') return 'src/injected/providerWrapper.js';

                    return 'assets/[name]-[hash].js';
                }
            }
        }
    }
});
