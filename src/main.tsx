import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import CssBaseline from '@mui/material/CssBaseline'
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'
import { ThemeProvider } from '@mui/material/styles'

import { router } from './router'
import { theme } from './theme'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root missing from index.html')

createRoot(root).render(
  <StrictMode>
    {/*
      Runs before first paint and stamps data-mui-color-scheme onto <html> from
      localStorage. Without it the app paints light, then corrects itself once React
      mounts — the "flash of wrong theme". The attribute here must match
      theme.cssVariables.colorSchemeSelector, or the swap silently never applies.
    */}
    <InitColorSchemeScript attribute="data-mui-color-scheme" defaultMode="system" />
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
