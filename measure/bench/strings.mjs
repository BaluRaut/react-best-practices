import { performance } from 'node:perf_hooks'
function bench(name, fn, iters = 25) { for (let i=0;i<5;i++) fn(); const s=[]; for (let i=0;i<iters;i++){const t=performance.now();fn();s.push(performance.now()-t)} s.sort((a,b)=>a-b); return {name, median:s[Math.floor(s.length/2)]} }
let sink = 0
const N = 100_000
const r1 = bench('concat +=', () => { let out = ''; for (let i = 0; i < N; i++) out += i; sink += out.length })
const r2 = bench('array.join', () => { const a = []; for (let i = 0; i < N; i++) a.push(i); sink += a.join('').length })
console.log('sink=', sink % 7)
console.log(`  += ${r1.median.toFixed(2)}ms vs join ${r2.median.toFixed(2)}ms → join is ${(r1.median/r2.median).toFixed(1)}x the += time`)
