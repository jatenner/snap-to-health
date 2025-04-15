/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        'xs': '480px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      colors: {
        // Primary color palette
        primary: '#10b981', // Emerald - represents growth and healing
        secondary: '#0ea5e9', // Sky Blue - represents clarity and calm
        accent: '#8b5cf6', // Purple - represents transformation
        background: '#f8fafc', // Light grey background for calmness
        
        // Nature-inspired colors
        forest: '#059669', // Deep green - represents vitality
        stone: '#78716c', // Stone - represents stability and groundedness
        leaf: '#34d399', // Vibrant green - represents fresh energy
        sky: '#0ea5e9', // Sky blue - represents expansiveness
        sand: '#fbbf24', // Warm gold - represents warmth and energy
        moss: '#84cc16', // Moss green - represents resilience
        coral: '#f43f5e', // Coral - represents vitality
        azure: '#38bdf8', // Light blue - represents peace
        indigo: '#6366f1', // Rich purple-blue - represents intuition
        teal: '#14b8a6', // Teal - harmony between mind and body
        navy: '#1e3a8a', // Deep blue - represents wisdom and depth
        slate: '#475569', // Neutral dark - represents balance
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'float': 'float 3s ease-in-out infinite',
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bio-glow': 'bioGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        bioGlow: {
          '0%, 100%': { filter: 'brightness(1) saturate(1)' },
          '50%': { filter: 'brightness(1.2) saturate(1.3)' },
        },
      },
      transitionProperty: {
        'size': 'height, width, transform',
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
      },
      boxShadow: {
        'lab': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'hover': '0 4px 20px -3px rgba(0, 0, 0, 0.1), 0 14px 25px -3px rgba(0, 0, 0, 0.05)',
      },
      backgroundImage: {
        'lab-grid': 'linear-gradient(to right, #10b98111 1px, transparent 1px), linear-gradient(to bottom, #10b98111 1px, transparent 1px)',
      },
      fontFamily: {
        'inter': ['Inter', 'system-ui', 'sans-serif'],
        'urbanist': ['Urbanist', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      fontSize: {
        'xxs': '0.65rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
  future: {
    hoverOnlyWhenSupported: true,
  },
}; 