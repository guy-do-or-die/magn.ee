import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
    plugins: [
        react(),
        viteStaticCopy({
            targets: [
                { src: 'manifest.json', dest: '.' }
            ]
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                // Entries
                popup: path.resolve(__dirname, 'src/ui/popup.html'),
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
