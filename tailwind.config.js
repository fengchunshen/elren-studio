import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ['class'],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                border: 'hsl(var(--border) / <alpha-value>)',
                input: 'hsl(var(--input) / <alpha-value>)',
                ring: 'hsl(var(--ring) / <alpha-value>)',
                background: 'hsl(var(--background) / <alpha-value>)',
                foreground: 'hsl(var(--foreground) / <alpha-value>)',
                ...Object.fromEntries(['primary', 'secondary', 'destructive', 'muted', 'accent', 'popover', 'card'].map(name => [name, {
                    DEFAULT: `hsl(var(--${name}) / <alpha-value>)`,
                    foreground: `hsl(var(--${name}-foreground) / <alpha-value>)`,
                }])),
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
        },
    },
    plugins: [animate],
}
