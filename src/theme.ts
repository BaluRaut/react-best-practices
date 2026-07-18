import { createTheme } from '@mui/material/styles'

// MUI v9 theming, CSS-variables mode.
//
// `colorSchemes` and `cssVariables` are BOTH opt-in: a bare `createTheme()` gives you
// no `theme.vars` and no dark scheme at all. With them on, `theme.vars.*` resolves to
// real CSS custom properties (e.g. `var(--mui-palette-primary-main, #1976d2)`), so the
// two schemes swap via one attribute on <html> instead of re-rendering the tree.
//
// The selector MUST match the attribute InitColorSchemeScript writes, or dark mode
// silently never applies. The shorthand `'data'` is a trap here: it expands to the
// boolean attribute `[data-dark]`, while InitColorSchemeScript writes
// `data-mui-color-scheme="dark"`. Spelling the attribute out keeps the two in sync.
//   'data'                  -> [data-dark] &                      (mismatch!)
//   'data-mui-color-scheme' -> [data-mui-color-scheme="dark"] &    (correct)
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-mui-color-scheme' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#0b6bcb' },
        secondary: { main: '#7b3fe4' },
        background: { default: '#fbfcfe', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#7cc4ff' },
        secondary: { main: '#c4a7ff' },
        background: { default: '#0b0e14', paper: '#11151f' },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h1: { fontSize: '2.6rem', fontWeight: 800, letterSpacing: '-0.025em' },
    h2: { fontSize: '1.7rem', fontWeight: 700, letterSpacing: '-0.015em' },
    h3: { fontSize: '1.25rem', fontWeight: 700 },
    code: {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { scrollBehavior: 'smooth' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
  },
})

// Custom typography variant needs module augmentation or TS rejects `variant="code"`.
declare module '@mui/material/styles' {
  interface TypographyVariants {
    code: React.CSSProperties
  }
  interface TypographyVariantsOptions {
    code?: React.CSSProperties
  }
}
declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    code: true
  }
}
