import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'

import { LabelLegend } from '../components/LabelLegend'
import { Markdown } from '../components/Markdown'
import { APPLIES_TO, DOCS_BY_SLUG, loadBody } from '../content/registry'
import { NotFound } from './NotFound'

export function DocPage() {
  const { slug } = useParams<{ slug: string }>()
  const doc = slug ? DOCS_BY_SLUG.get(slug) : undefined
  const [body, setBody] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let active = true
    setBody(null)
    loadBody(slug)?.then((text) => {
      // Guard against a resolve landing after the user has navigated away.
      if (active) setBody(text)
    })
    return () => {
      active = false
    }
  }, [slug])

  if (!doc) return <NotFound />

  const appliesTo = slug ? (APPLIES_TO[slug] ?? []) : []

  return (
    <Box>
      {appliesTo.length > 0 && (
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}
        >
          <Box
            component="span"
            sx={{
              fontSize: '0.66rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            Applies to
          </Box>
          {appliesTo.map((v) => (
            <Chip
              key={v}
              label={v}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.68rem', height: 22 }}
            />
          ))}
        </Stack>
      )}
      <Stack direction="row" spacing={0.75} sx={{ mb: 3, flexWrap: 'wrap', gap: 0.75 }}>
        {doc.tags.map((tag) => (
          <Chip key={tag} label={tag} size="small" variant="outlined" />
        ))}
      </Stack>
      {body === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Show the taxonomy only on pages that actually use a labelled callout. */}
          {/🟢|🟡|🔴/.test(body) && <LabelLegend />}
          <Markdown>{body}</Markdown>
        </>
      )}
    </Box>
  )
}
