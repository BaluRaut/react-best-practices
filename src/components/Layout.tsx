import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, NavLink, Outlet, useLocation } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined'
import GitHubIcon from '@mui/icons-material/GitHub'
import LightModeIcon from '@mui/icons-material/LightModeOutlined'
import MenuIcon from '@mui/icons-material/Menu'
import { useColorScheme } from '@mui/material/styles'

import { DOCS, SECTIONS, type Section } from '../content/registry'

const DRAWER_WIDTH = 280
const REPO = 'https://github.com/BaluRaut/react-best-practices'

function ColorModeToggle() {
  const { mode, setMode } = useColorScheme()
  // `mode` is undefined until the provider mounts on the client; rendering an icon
  // based on it before then would flip on first paint.
  if (!mode) return <Box sx={{ width: 40, height: 40 }} />
  const next = mode === 'dark' ? 'light' : 'dark'
  return (
    <IconButton onClick={() => setMode(next)} aria-label={`Switch to ${next} mode`} color="inherit">
      {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
    </IconButton>
  )
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const order: Section[] = ['versions', 'foundations', 'stack', 'meta']
  return (
    <List dense sx={{ py: 0 }}>
      {order.map((section) => (
        <li key={section}>
          <ul style={{ padding: 0 }}>
            <ListSubheader
              sx={{
                fontSize: '0.7rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 800,
                bgcolor: 'transparent',
                lineHeight: '36px',
                mt: 1,
              }}
            >
              {SECTIONS[section].title}
            </ListSubheader>
            {DOCS.filter((d) => d.section === section).map((doc) => (
              <ListItemButton
                key={doc.slug}
                component={NavLink}
                to={`/${doc.slug}`}
                onClick={onNavigate}
                sx={{
                  borderRadius: 1.5,
                  mx: 1,
                  '&.active': {
                    bgcolor: 'action.selected',
                    '& .MuiListItemText-primary': { color: 'primary.main', fontWeight: 700 },
                  },
                }}
              >
                <ListItemText
                  primary={doc.title}
                  slotProps={{ primary: { sx: { fontSize: '0.86rem', lineHeight: 1.35 } } }}
                />
              </ListItemButton>
            ))}
          </ul>
        </li>
      ))}
    </List>
  )
}

export function Layout() {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // Focus management: a client-side route change does not move focus, so screen
  // reader users stay parked wherever they were. Move focus to the new <main> and
  // reset scroll on every navigation.
  useEffect(() => {
    mainRef.current?.focus()
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar variant="dense">
          {!isDesktop && (
            <IconButton edge="start" onClick={() => setOpen(true)} aria-label="Open navigation" sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography
            component={RouterLink}
            to="/"
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.02em',
              textDecoration: 'none',
              color: 'text.primary',
              flexGrow: 1,
            }}
          >
            React Best Practices
          </Typography>
          <ColorModeToggle />
          <IconButton href={REPO} target="_blank" rel="noopener" aria-label="View source on GitHub" color="inherit">
            <GitHubIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop || open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              borderRight: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.default',
            },
          }}
        >
          <Toolbar variant="dense" />
          <Divider />
          <Nav onNavigate={() => setOpen(false)} />
        </Drawer>
      </Box>

      <Box
        component="main"
        ref={mainRef}
        tabIndex={-1}
        sx={{ flexGrow: 1, minWidth: 0, outline: 'none' }}
      >
        <Toolbar variant="dense" />
        <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}
