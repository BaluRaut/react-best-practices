import { memo, useState, createContext, useContext } from 'react'
import { render, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

// Count renders by incrementing a counter INSIDE the component body (a render IS a
// call of the function). No Profiler wrapper — that wrapper re-renders with the
// parent and would mask the child's bailout.
describe('measured render counts', () => {
  it('React.memo stops re-renders when props are unchanged', () => {
    const plain = { n: 0 }
    const memoized = { n: 0 }
    let bump = (_: number) => {}

    function PlainChild({ label }: { label: string }) {
      plain.n++
      return <span>{label}</span>
    }
    const MemoChild = memo(function MemoChild({ label }: { label: string }) {
      memoized.n++
      return <span>{label}</span>
    })

    function App() {
      const [n, setN] = useState(0)
      bump = setN
      return (
        <>
          <span>{n}</span>
          <PlainChild label="static" />
          <MemoChild label="static" />
        </>
      )
    }
    render(<App />)
    for (let i = 1; i <= 10; i++) act(() => bump(i))

    console.log('MEASURE ' + JSON.stringify({
      test: 'memo', parent_updates: 10,
      plain_child_renders: plain.n, memo_child_renders: memoized.n,
    }))
    expect(memoized.n).toBeLessThan(plain.n)
  })

  it('an un-split context re-renders consumers that do not read the changed field', () => {
    const Ctx = createContext({ a: 0, b: 0 })
    const aRenders = { n: 0 }
    const bRenders = { n: 0 }
    let setState = (_: any) => {}

    function ConsumerA() {
      aRenders.n++
      const { a } = useContext(Ctx)
      return <span>{a}</span>
    }
    function ConsumerB() {
      bRenders.n++
      const { b } = useContext(Ctx)
      return <span>{b}</span>
    }
    function App() {
      const [s, set] = useState({ a: 0, b: 0 })
      setState = set
      return (
        <Ctx.Provider value={s}>
          <ConsumerA />
          <ConsumerB />
        </Ctx.Provider>
      )
    }
    render(<App />)
    for (let i = 1; i <= 5; i++) act(() => setState((p: any) => ({ ...p, a: i })))

    console.log('MEASURE ' + JSON.stringify({
      test: 'context', updates_to_a_only: 5,
      consumerA_renders: aRenders.n,
      consumerB_renders_reads_only_b: bRenders.n,
    }))
    expect(bRenders.n).toBe(aRenders.n)
  })
})
