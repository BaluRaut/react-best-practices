// Simulate 3 independent requests, each ~200ms, and measure wall time.
const req = (ms) => new Promise((r) => setTimeout(r, ms))
const DELAYS = [200, 180, 220]

async function sequential() {
  const t = performance.now()
  for (const d of DELAYS) await req(d)
  return performance.now() - t
}
async function parallel() {
  const t = performance.now()
  await Promise.all(DELAYS.map(req))
  return performance.now() - t
}
const s = await sequential()
const p = await parallel()
console.log(JSON.stringify({
  sequential_ms: Math.round(s),
  parallel_ms: Math.round(p),
  speedup: +(s / p).toFixed(1),
  delays: DELAYS,
}))
