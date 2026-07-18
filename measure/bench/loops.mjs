// Honest micro-benchmark harness: warm up the JIT, take several samples, report the
// median, and force a side effect (the `sink`) so V8 can't dead-code-eliminate the work.
import { performance } from 'node:perf_hooks'

function bench(name, fn, { iters = 30, inner = 1 } = {}) {
  for (let i = 0; i < 5; i++) fn() // warmup — let V8 optimize
  const samples = []
  for (let i = 0; i < iters; i++) {
    const t = performance.now()
    for (let j = 0; j < inner; j++) fn()
    samples.push((performance.now() - t) / inner)
  }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]
  return { name, median }
}

const N = 1_000_000
const arr = Array.from({ length: N }, (_, i) => i)
let sink = 0

const results = [
  bench('for (i++)', () => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; sink += s }),
  bench('for (cached len)', () => { let s = 0; for (let i = 0, n = arr.length; i < n; i++) s += arr[i]; sink += s }),
  bench('while', () => { let s = 0, i = 0; while (i < arr.length) { s += arr[i]; i++ } sink += s }),
  bench('for...of', () => { let s = 0; for (const v of arr) s += v; sink += s }),
  bench('forEach', () => { let s = 0; arr.forEach((v) => { s += v }); sink += s }),
  bench('reduce', () => { const s = arr.reduce((a, v) => a + v, 0); sink += s }),
]

const fastest = Math.min(...results.map((r) => r.median))
console.log('sink =', sink, '(prevents dead-code elimination)\n')
console.log('Sum over 1,000,000 ints — median ms/op, and slowdown vs fastest:')
for (const r of results.sort((a, b) => a.median - b.median)) {
  console.log(`  ${r.name.padEnd(18)} ${r.median.toFixed(2).padStart(7)} ms   ${(r.median / fastest).toFixed(2)}x`)
}
