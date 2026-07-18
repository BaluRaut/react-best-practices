import { performance } from 'node:perf_hooks'
function bench(name, fn, iters = 25) {
  for (let i = 0; i < 5; i++) fn()
  const s = []
  for (let i = 0; i < iters; i++) { const t = performance.now(); fn(); s.push(performance.now() - t) }
  s.sort((a, b) => a - b)
  return { name, median: s[Math.floor(s.length / 2)] }
}
let sink = 0
const N = 1_000_000

// 1) Monomorphic vs polymorphic (megamorphic) property access — same shape vs mixed shapes
const mono = Array.from({ length: N }, (_, i) => ({ x: i, y: i }))
const poly = Array.from({ length: N }, (_, i) =>
  i % 4 === 0 ? { x: i, y: i } : i % 4 === 1 ? { x: i, y: i, z: i } : i % 4 === 2 ? { y: i, x: i } : { a: i, x: i })
const r1 = bench('monomorphic .x', () => { let s = 0; for (let i = 0; i < N; i++) s += mono[i].x; sink += s })
const r2 = bench('polymorphic .x', () => { let s = 0; for (let i = 0; i < N; i++) s += poly[i].x; sink += s })

// 2) Packed vs holey array
const packed = Array.from({ length: N }, (_, i) => i)
const holey = Array.from({ length: N }, (_, i) => i); holey[500000] = undefined; delete holey[250000]
const r3 = bench('packed array', () => { let s = 0; for (let i = 0; i < N; i++) s += packed[i] || 0; sink += s })
const r4 = bench('holey array', () => { let s = 0; for (let i = 0; i < N; i++) s += holey[i] || 0; sink += s })

// 3) try/catch inside vs outside the hot loop
const r5 = bench('try/catch outside', () => { let s = 0; try { for (let i = 0; i < N; i++) s += i } catch {} sink += s })
const r6 = bench('try/catch inside', () => { let s = 0; for (let i = 0; i < N; i++) { try { s += i } catch {} } sink += s })

console.log('sink=', sink % 7, '\n')
const show = (a, b, label) =>
  console.log(`  ${label}: ${a.name} ${a.median.toFixed(2)}ms vs ${b.name} ${b.median.toFixed(2)}ms → ${(b.median / a.median).toFixed(1)}x`)
show(r1, r2, 'object shape')
show(r3, r4, 'array holes ')
show(r5, r6, 'try/catch   ')
