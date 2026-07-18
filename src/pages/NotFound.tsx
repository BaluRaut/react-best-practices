import { Link as RouterLink } from 'react-router-dom'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export function NotFound() {
  return (
    <Stack spacing={2} sx={{ py: 8, alignItems: 'flex-start' }}>
      <Typography variant="h1" sx={{ fontSize: '3rem' }}>
        404
      </Typography>
      <Typography color="text.secondary">That page does not exist.</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Back to the index
      </Button>
    </Stack>
  )
}
