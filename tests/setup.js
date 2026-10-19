import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());
// Node 26 exposes an unconfigured localStorage accessor; use deterministic browser storage.
const storage = new Map();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(String(key)) ?? null,
    setItem: (key, value) => storage.set(String(key), String(value)),
    removeItem: key => storage.delete(String(key)),
    clear: () => storage.clear(),
    key: index => [...storage.keys()][index] ?? null,
    get length() { return storage.size; },
} });
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.PointerEvent = MouseEvent;
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
HTMLElement.prototype.scrollIntoView = () => {};
// nwsapi 2.2.27 resolves :modal by calling Element.matches again, recursing until the stack overflows
// (~0.3s per call). Floating UI probes it while positioning every Radix popper, so each menu took seconds
// to open. jsdom has no top layer, so nothing can match :modal here.
const nativeMatches = Element.prototype.matches;
Element.prototype.matches = function matches(selector) { return selector === ':modal' ? false : nativeMatches.call(this, selector); };
