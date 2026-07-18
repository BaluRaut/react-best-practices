import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'

import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'

function PageFallback() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  )
}

// The doc page pulls in react-markdown + highlight.js, which are heavy and only
// needed once you open an article. Splitting it keeps those off the landing bundle.
const DocPage = lazy(() =>
  import('./pages/DocPage').then((m) => ({ default: m.DocPage })),
)

// BASE_URL comes from vite.config.ts `base`, so the router and the asset URLs can
// never disagree about where the app is mounted. Hard-coding '/react-best-practices/'
// here would break `npm run dev`, which serves from '/'.
export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      errorElement: <NotFound />,
      children: [
        { index: true, element: <Home /> },
        {
          path: ':slug',
          element: (
            <Suspense fallback={<PageFallback />}>
              <DocPage />
            </Suspense>
          ),
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
