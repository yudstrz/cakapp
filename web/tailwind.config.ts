import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        paper: 'var(--bg)',
        chrome: 'var(--chrome)',
        card: 'var(--card)',
        float: 'var(--float)',
        ink: 'var(--ink)',
        written: 'var(--written)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        control: 'var(--control-border)',
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          ink: 'var(--primary-ink)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          soft: 'var(--secondary-soft)',
          solid: 'var(--secondary-solid)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
