export function applyTheme(theme) {
    const current = ['dark', 'light', 'solarized'].includes(theme) ? theme : 'dark';
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-dark', 'theme-light', 'theme-solarized');
    root.classList.add(`theme-${current}`);
    root.classList.toggle('dark', current === 'dark');
}
