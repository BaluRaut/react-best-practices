import { memo } from 'react'
import { isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import Alert, { type AlertColor } from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

import 'highlight.js/styles/github-dark.css'

/**
 * First non-whitespace run of text inside a node tree — used to read a callout's
 * leading label emoji. Whitespace-only nodes are skipped: react-markdown inserts "\n"
 * text nodes between a blockquote and its inner <p>, and returning one of those would
 * mask the emoji and send every callout to the default color.
 */
function firstText(node: ReactNode): string {
  if (typeof node === 'string') return node.trim() ? node : ''
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) {
    for (const child of node) {
      const t = firstText(child)
      if (t) return t
    }
    return ''
  }
  if (isValidElement(node)) {
    return firstText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

/** GitHub-style heading anchor, so every section is linkable. */
function slugify(children: ReactNode): string {
  return String(children)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

const components: Components = {
  h1: ({ children }) => (
    <Typography variant="h1" sx={{ mt: 0, mb: 2, fontSize: { xs: '2rem', md: '2.6rem' } }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography
      variant="h2"
      id={slugify(children)}
      sx={{ mt: 6, mb: 1.5, scrollMarginTop: 80, fontSize: { xs: '1.4rem', md: '1.7rem' } }}
    >
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="h3" id={slugify(children)} sx={{ mt: 4, mb: 1, scrollMarginTop: 80 }}>
      {children}
    </Typography>
  ),
  h4: ({ children }) => (
    <Typography variant="subtitle1" sx={{ mt: 3, mb: 1, fontWeight: 700 }}>
      {children}
    </Typography>
  ),
  p: ({ children }) => (
    <Typography sx={{ my: 1.5, lineHeight: 1.75, color: 'text.secondary' }}>{children}</Typography>
  ),
  a: ({ href, children }) => (
    <Link href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noopener">
      {children}
    </Link>
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 3, my: 1.5, color: 'text.secondary', lineHeight: 1.75 }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 3, my: 1.5, color: 'text.secondary', lineHeight: 1.75 }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Box component="li" sx={{ my: 0.5 }}>
      {children}
    </Box>
  ),
  blockquote: ({ children }) => {
    // Callout color follows the leading label emoji, so the pattern taxonomy
    // (🟢 best practice / 🟡 optimization / 🔴 advanced-or-gotcha) reads as color, not
    // just text — and the same markdown still reads correctly inside a Claude skill.
    const lead = firstText(children).trimStart()
    const severity: AlertColor = lead.startsWith('🟢')
      ? 'success'
      : lead.startsWith('🟡')
        ? 'warning'
        : lead.startsWith('🔴')
          ? 'error'
          : 'info'
    return (
      <Alert severity={severity} variant="outlined" sx={{ my: 2, '& p': { my: 0.5 } }}>
        {children}
      </Alert>
    )
  },
  hr: () => <Divider sx={{ my: 4 }} />,
  table: ({ children }) => (
    <TableContainer component={Paper} variant="outlined" sx={{ my: 3, overflowX: 'auto' }}>
      <Table size="small">{children}</Table>
    </TableContainer>
  ),
  thead: ({ children }) => <TableHead>{children}</TableHead>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</TableCell>,
  td: ({ children }) => <TableCell sx={{ verticalAlign: 'top' }}>{children}</TableCell>,

  code: ({ className, children, ...props }) => {
    // react-markdown v10 has no `inline` prop: a fenced block is a <code> with a
    // language-* class inside a <pre>. Everything else is inline.
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }
    return (
      <Box
        component="code"
        sx={(t) => ({
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '0.86em',
          px: 0.7,
          py: 0.2,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
          color: 'primary.main',
          ...t.applyStyles('dark', { color: '#8fd3ff' }),
        })}
      >
        {children}
      </Box>
    )
  },

  pre: ({ children }) => (
    <Box
      component="pre"
      sx={{
        my: 2.5,
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#0d1117',
        overflowX: 'auto',
        fontSize: '0.85rem',
        lineHeight: 1.6,
        '& code': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      }}
    >
      {children}
    </Box>
  ),
}

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  )
})
