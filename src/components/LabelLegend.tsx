import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

const LABELS = [
  {
    emoji: '🟢',
    name: 'Best practice',
    blurb: 'Preferred by default — a correctness or maintainability guideline that holds in most contexts.',
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
      <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: 1.5, fontStyle: 'italic' }}>
        These are guidelines and trade-offs, not immutable laws — context decides. Every optimization
        below says when <em>not</em> to use it.
      </Typography>
    </Box>
  )
}
