import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'

import { LabelLegend } from '../components/LabelLegend'
import { Markdown } from '../components/Markdown'
import { DOCS_BY_SLUG, loadBody } from '../content/registry'
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

  return (
    <Box>
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
