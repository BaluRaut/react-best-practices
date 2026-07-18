import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

import { DOCS, SECTIONS, docsInSection, type Section } from '../content/registry'

const STACK = [
  ['React', '19.2.7'],
  ['TypeScript', '7.0.2'],
  ['Material UI', '9.2.0'],
  ['Vite', '8.1.5'],
]

const ORDER: Section[] = ['fundamentals', 'foundations', 'architecture', 'versions', 'stack', 'meta']

export function Home() {
  const skillCount = DOCS.filter((d) => d.skill).length

  return (
    <Box>
      <Box sx={{ py: { xs: 2, md: 4 } }}>
        <Chip label="Verified against the registry, not from memory" size="small" sx={{ mb: 2 }} />
        <Typography variant="h1" sx={{ mb: 2, fontSize: { xs: '2.1rem', md: '3rem' } }}>
          React best practices that are actually current
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '1.1rem', maxWidth: 680, mb: 3 }}>
          A reference for React, TypeScript and JavaScript — plus the full React 16 → 19 migration
          matrix. Every version claim here was checked against primary sources or measured on a real
          install, because most advice on this subject is quietly out of date.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 4 }}>
          {STACK.map(([name, version]) => (
            <Chip
              key={name}
              label={`${name} ${version}`}
              size="small"
              variant="outlined"
              sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.72rem' }}
            />
          ))}
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
          <Button
            component={RouterLink}
            to="/migration-matrix"
            variant="contained"
            endIcon={<ArrowForwardIcon />}
          >
            Start with the migration matrix
          </Button>
          <Button component={RouterLink} to="/skills" variant="outlined">
            Install as {skillCount} Claude skills
          </Button>
        </Stack>
      </Box>

      {ORDER.map((section) => (
        <Box key={section} sx={{ mt: 6 }}>
          <Typography
            sx={{
              fontSize: '0.72rem',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 800,
              color: 'text.secondary',
              mb: 0.5,
            }}
          >
            {SECTIONS[section].title}
          </Typography>
          <Typography sx={{ color: 'text.secondary', mb: 2, fontSize: '0.95rem' }}>
            {SECTIONS[section].blurb}
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            }}
          >
            {docsInSection(section).map((doc) => (
              <Card key={doc.slug} variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea
                  component={RouterLink}
                  to={`/${doc.slug}`}
                  sx={{ height: '100%', p: 2.5, alignItems: 'flex-start' }}
                >
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', mb: 0.75 }}>
                    {doc.title}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem', lineHeight: 1.6 }}>
                    {doc.blurb}
                  </Typography>
                  {doc.skill && (
                    <Chip
                      label={`skill: ${doc.skill}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ mt: 1.5, fontSize: '0.68rem', height: 20 }}
                    />
                  )}
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
