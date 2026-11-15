import react from 'eslint-plugin-react'
import hooks from 'eslint-plugin-react-hooks'

export default [
  {
    files: ['{host,src}/**/*.{js,jsx}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { react, 'react-hooks': hooks },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
