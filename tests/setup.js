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
