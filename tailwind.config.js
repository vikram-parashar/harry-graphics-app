import type { CustomConfigParams } from 'nativewind/dist/types'

/**
 * NativeWind / Tailwind config.
 *
 * Color tokens mirror the harry-graphics-site web app so the same
 * class names (`bg-cream`, `text-charcoal`, `border-cyan` etc.) work
 * identically on both sides. Visual rule: flat, hard edges, no shadows.
 */
const config: CustomConfigParams = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        cream: '#F5F1E8',
        'cream-dark': '#EDE7D9',
        charcoal: '#1A1A1A',
        'charcoal-light': '#6B6B6B',
        'charcoal-soft': '#2D2D2D',
        cyan: '#00AEEF',
        highlight: '#FF6B35',
        magenta: '#D32F2F',
        yellow: '#FBC02D',
        'black-rich': '#0A0A0A',
      },
      fontFamily: {
        serif: ['serifDisplay', 'serif'],
        mono: ['monospace'],
        sans: ['System'],
      },
      borderRadius: {
        // Force 0 radius globally — flat design language.
        none: '0',
        DEFAULT: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        DEFAULT: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
      },
    },
  },
  plugins: [],
}

export default config
