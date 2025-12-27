import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Foundational base color
        vigil: {
          50: '#e8edef',
          100: '#d1dce0',
          200: '#a3b9c1',
          300: '#7596a2',
          400: '#4a7383',
          500: '#2d5261',
          600: '#1e3d4a',
          700: '#152d37',
          800: '#0f2129',
          900: '#0B1F2A', // Primary base
          950: '#071419',
        },
        // Classic MacOS-inspired system grays - soft, neutral, eye-safe
        // No pure blacks or stark whites
        gray: {
          50: '#f8f8f7',   // Warm off-white
          100: '#f0f0ee',  // Light surface
          200: '#e4e4e1',  // Subtle border
          300: '#d4d4d0',  // Muted border
          400: '#a6a6a1',  // Disabled text
          500: '#787874',  // Secondary text
          600: '#5a5a56',  // Body text
          700: '#3d3d3a',  // Primary text
          800: '#2a2a27',  // Strong text
          900: '#1a1a18',  // Near-black
        },
        // Status colors - muted, functional, not decorative
        status: {
          ok: '#3d6b4f',
          warning: '#8b7234',
          critical: '#8b4242',
          overdue: '#6b2d2d',
        },
        // Surface hierarchy
        surface: {
          page: '#f8f8f7',     // Page background
          raised: '#ffffff',   // Elevated panels
          sunken: '#f0f0ee',   // Recessed areas
          inset: '#e8e8e5',    // Deeply recessed
        },
        // Accent - used sparingly, engraved feel
        accent: {
          DEFAULT: '#0B1F2A',
          muted: '#1e3d4a',
          subtle: '#2d5261',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'SF Mono',
          'Monaco',
          'Inconsolata',
          'Fira Mono',
          'Consolas',
          'monospace',
        ],
        display: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
        'xs': ['0.8125rem', { lineHeight: '1.25rem' }],
        'sm': ['0.875rem', { lineHeight: '1.375rem' }],
        'base': ['0.9375rem', { lineHeight: '1.625rem' }],
        'lg': ['1.0625rem', { lineHeight: '1.75rem' }],
        'xl': ['1.1875rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.375rem', { lineHeight: '2rem' }],
        '3xl': ['1.625rem', { lineHeight: '2.125rem' }],
        '4xl': ['2rem', { lineHeight: '2.375rem', letterSpacing: '-0.01em' }],
        '5xl': ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        'sm': '3px',
        'DEFAULT': '4px',
        'md': '6px',
        'lg': '8px',
      },
      boxShadow: {
        // Engraved effect - inset shadow with highlight below
        'engraved': 'inset 0 1px 2px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(0,0,0,0.04)',
        'engraved-sm': 'inset 0 1px 1px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.03)',
        // Raised effect - subtle lift without harsh top border
        'raised': '0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        'raised-sm': '0 1px 1px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)',
        // Panel shadows - architectural
        'panel': '0 0 0 1px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.03)',
        'panel-lg': '0 0 0 1px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04)',
        // Border-like shadows
        'border': '0 0 0 1px rgba(0,0,0,0.08)',
        'border-b': '0 1px 0 rgba(0,0,0,0.06)',
        // Inset for inputs
        'inset': 'inset 0 1px 2px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.08)',
        'inset-sm': 'inset 0 1px 1px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      maxWidth: {
        'prose': '65ch',
        'content': '72rem',
      },
    },
  },
  plugins: [],
};

export default config;
