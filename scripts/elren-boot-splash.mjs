import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const styles = ['elren-brand.css', 'elren-color-field.css', 'elren-motion-mark.css', 'elren-loader.css'];

// Render the production component at build/serve time. This keeps the early
// HTML splash identical to React without a second hand-maintained animation.
export async function renderElrenBootSplash(root) {
    const compiled = await build({
        entryPoints: [join(root, 'src/components/brand/elren-loader.jsx')],
        bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
        alias: { '@': join(root, 'src') }, loader: { '.css': 'empty' },
        plugins: [{ name: 'bundled-svg-source', setup(builder) {
            builder.onResolve({ filter: /\.svg\?raw$/ }, args => ({
                path: args.path.startsWith('@/') ? join(root, 'src', args.path.slice(2, -4)) : resolve(args.resolveDir, args.path.slice(0, -4)),
                namespace: 'svg-source',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'svg-source' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
        } }],
    });
    const bundled = { exports: {} };
    // Only our own bundled source is evaluated, with the same React instance
    // used by react-dom/server (needed for useId and its gradient references).
    new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, bundled, bundled.exports);
    const markup = renderToStaticMarkup(React.createElement(bundled.exports.ElrenLoadingScene, { label: '正在启动工作空间…' }), { identifierPrefix: 'elren-boot-' });
    const css = (await Promise.all(styles.map(name => readFile(join(root, 'src/components/brand', name), 'utf8')))).join('\n');
    return { markup, css };
}

export function elrenBootSplashPlugin() {
    let root;
    return {
        name: 'elren-boot-splash',
        configResolved(config) { root = config.root; },
        transformIndexHtml: { order: 'pre', async handler(html, context) {
            if (resolve(context.filename) !== join(root, 'index.html')) return html;
            const { markup, css } = await renderElrenBootSplash(root);
            return {
                html: html.replace('<div id="root"></div>', `<script>window.__ELREN_LOADING_STARTED_AT__=performance.now();</script><div id="root"><div data-elren-bootstrap>${markup}</div></div>`),
                tags: [{ tag: 'style', attrs: { id: 'elren-boot-css' }, children: css, injectTo: 'head' }],
            };
        } },
    };
}
