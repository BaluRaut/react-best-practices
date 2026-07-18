import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

const LABELS = [
  {
    emoji: '🟢',
    name: 'Best practice',
    blurb: 'Do this by default. A correctness or maintainability rule, not a matter of taste.',
    color: 'success.main',
  },
  {
    emoji: '🟡',
    name: 'Optimization',
    blurb: 'Apply only when a measured problem calls for it. Has a cost; not a default.',
    color: 'warning.main',
  },
  {
    emoji: '🔴',
    name: 'Advanced / edge case',
    blurb: 'A sharp tool or a gotcha. Reach for it knowingly, and read the tradeoff first.',
    color: 'error.main',
  },
] as const

/** Explains the 🟢/🟡/🔴 taxonomy used in the callouts across every page. */
export function LabelLegend() {
  return (
    <Box
      sx={{
        my: 3,
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Typography
        sx={{
          fontSize: '0.68rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontWeight: 800,
          color: 'text.secondary',
          mb: 1.5,
        }}
      >
        How to read the labels
      </Typography>
      <Stack spacing={1.25}>
        {LABELS.map((l) => (
          <Stack key={l.name} direction="row" spacing={1.25} sx={{ alignItems: 'baseline' }}>
            <Box component="span" sx={{ fontSize: '0.9rem' }}>
              {l.emoji}
            </Box>
            <Typography sx={{ fontSize: '0.9rem' }}>
              <Box component="span" sx={{ fontWeight: 700, color: l.color }}>
                {l.name}
              </Box>{' '}
              — <Box component="span" sx={{ color: 'text.secondary' }}>{l.blurb}</Box>
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
