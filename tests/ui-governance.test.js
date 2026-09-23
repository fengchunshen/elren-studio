import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { expect, it } from 'vitest';

const traverse = traverseModule.default || traverseModule;

it('routes standard widgets through the shared UI layer', () => {
    const violations = [];
    for (const file of ['src/App.jsx', 'src/platform/PlatformRoot.jsx', 'src/main.jsx']) {
        const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
        traverse(ast, { JSXOpeningElement({ node }) {
            const name = node.name.name;
            if (['button', 'select', 'textarea', 'label'].includes(name)) violations.push(`${file}:${node.loc.start.line} ${name}`);
            // Native file inputs deliberately preserve existing FileList/ref upload contracts.
            if (name === 'input' && !node.attributes.some(a => a.name?.name === 'type' && a.value?.value === 'file')) violations.push(`${file}:${node.loc.start.line} input`);
        } });
        traverse(ast, { JSXElement(element) {
            if (element.node.openingElement.name.name !== 'Button') return;
            if (element.findParent(parent => parent.isJSXElement() && parent.node.openingElement.name.name === 'Button')) violations.push(`${file}:${element.node.loc.start.line} nested Button`);
        } });
    }
    expect(violations).toEqual([]);
});

it('keeps UI primitives independent of editor and platform business modules', () => {
    for (const file of fs.readdirSync('src/components/ui').filter(file => file.endsWith('.jsx'))) {
        const source = fs.readFileSync(path.join('src/components/ui', file), 'utf8');
        expect(source).not.toMatch(/from ['"][^'"]*(?:services|platform|App\.jsx)/);
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|(?:bg|text|border)-zinc-\d/);
    }
});

it('declares an actual shadcn source registry and compatible Tailwind aliases', () => {
    const config = JSON.parse(fs.readFileSync('components.json', 'utf8'));
    expect(config.tsx).toBe(false);
    expect(config.rsc).toBe(false);
    expect(config.tailwind.cssVariables).toBe(true);
    expect(config.aliases.ui).toBe('@/components/ui');
    expect(fs.existsSync(config.tailwind.css)).toBe(true);
    expect(fs.existsSync(config.tailwind.config)).toBe(true);
});
