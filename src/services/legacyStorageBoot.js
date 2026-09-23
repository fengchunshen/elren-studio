// Must stay the first import of main.jsx: storage modules read their keys while loading.
import { migrateLegacyLocalStorage } from './legacyStorage';

export let legacyStorageError = null;
try {
    migrateLegacyLocalStorage();
} catch (error) {
    legacyStorageError = error;
}
