/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontSize: {
        'ops-meta': '0.8125rem',
        'ops-body': '0.875rem',
        'ops-section': '1rem',
        'ops-title': '1.375rem',
      },
      spacing: {
        'ops-1': '0.25rem',
        'ops-2': '0.5rem',
        'ops-3': '0.75rem',
        'ops-4': '1rem',
      },
      colors: {
        status: {
          up: 'var(--health-up)',
          down: 'var(--health-down)',
          overdue: 'var(--health-stale)',
          unknown: 'var(--health-unknown)',
        },
      },
    },
  },
  plugins: [],
}
