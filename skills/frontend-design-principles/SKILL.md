---
name: frontend-design-principles
description: "Use when structuring React components, hooks, or component APIs: SOLID applied to the front end, composition over configuration, polymorphism (the as prop, compound components, render props), and data-driven over conditional rendering. Follow these patterns instead of guessing at component design."
metadata:
  source: https://baluraut.github.io/frontend-best-practices/design-principles
---

# Design Principles for React

SOLID and its cousins were written for classes, but the *ideas* are about change: where it lands, how
far it spreads, and whether you can absorb it without editing working code. React has no classes worth
speaking of anymore — the units are **components, hooks, and modules** — so this page translates the
principles into those terms, with the bad-and-better code a reviewer would actually flag.

The goal is not to recite SOLID. It's to give you (and any tool reading these as a skill) a small set of
**named forces** to point at during design, so component APIs are chosen deliberately instead of guessed.

---

## Single Responsibility: one reason to change

A component or hook should have **one reason to change**. Not "do one thing" — that's too vague — but:
if two different kinds of requirement (a layout tweak and a data-format change) force edits to the same
function, it's carrying two responsibilities.

```tsx
// 🔴 Three reasons to change live in one component: fetching, formatting, and layout.
function UserCard({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => {
    fetch(`/api/users/${id}`).then((r) => r.json()).then(setUser)
  }, [id])
  if (!user) return <Spinner />
  const name = `${user.first} ${user.last}`.trim()
  const joined = new Date(user.createdAt).toLocaleDateString()
  return <article className="card"><h3>{name}</h3><time>{joined}</time></article>
}
```

```tsx
// 🟢 Each layer changes for its own reason.
function useUser(id: string) {          // changes when fetching/caching changes
  return useQuery({ queryKey: ['user', id], queryFn: () => getUser(id) })
}
const fullName = (u: User) => `${u.first} ${u.last}`.trim()   // changes when naming rules change

function UserCard({ id }: { id: string }) {                    // changes when layout changes
  const { data: user } = useUser(id)
  if (!user) return <Spinner />
  return (
    <article className="card">
      <h3>{fullName(user)}</h3>
      <time>{formatDate(user.createdAt)}</time>
    </article>
  )
}
```

> 🟢 **Best practice** — extract a custom hook when a component mixes *how it gets data* with *how it
> looks*, and extract pure functions for *how it formats*. The test: can you change the date format
> without scrolling past JSX, and restyle the card without touching a `fetch`? If not, it's doing too
> much.

> 🟡 **Optimization** — don't over-split. A 30-line component that fetches and renders one thing has one
> reason to change in practice; shattering it into five files to "obey SRP" trades a real cost
> (indirection, jumping between files) for a principle it didn't violate. **When NOT to extract:** when
> the parts always change together anyway. SRP is about *independent* reasons to change, not line count.

---

## Open/Closed: extend without editing

Code should be **open to extension, closed to modification** — you add behavior by adding code, not by
editing a working component and risking its existing callers. In React the lever is almost always
**props and composition**, and the anti-pattern is almost always a growing `if`/`switch` on a `type`.

```tsx
// 🔴 Every new variant edits this component — and can break the existing ones.
function Button({ variant, ...props }: { variant: 'primary' | 'danger' | 'ghost' }) {
  if (variant === 'primary') return <button className="btn-primary" {...props} />
  if (variant === 'danger') return <button className="btn-danger" {...props} />
  if (variant === 'ghost') return <button className="btn-ghost" {...props} />
  return <button {...props} />
}
```

```tsx
// 🟢 Closed for modification: adding a variant is data, not a code edit to the component.
const VARIANTS = {
  primary: 'btn-primary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
} as const

function Button({ variant = 'primary', className, ...props }:
  { variant?: keyof typeof VARIANTS } & React.ComponentProps<'button'>) {
  return <button className={clsx(VARIANTS[variant], className)} {...props} />
}
```

> 🟢 **Best practice** — when you feel the urge to add another branch to a component's `if`/`switch`,
> reach instead for a lookup table (data-driven), a new prop, or composition. Adding an entry to a map
> can't break the existing entries; editing a shared conditional can. This is the single most useful
> SOLID idea in day-to-day React.

See [Data-driven over conditional](#data-driven-over-conditional) below — it's OCP in its most common
React form.

---

## Liskov Substitution: honor the contract you extend

If a component accepts the props of an element or a base component, it must behave like one — a caller
who swaps your component in for a plain `<button>` shouldn't get surprised. The usual violation is
**swallowing the props a caller reasonably expects to pass through**.

```tsx
// 🔴 Looks like a button, isn't substitutable for one: no ref, no onKeyDown, no type, no aria-*.
function IconButton({ icon, onClick }: { icon: ReactNode; onClick: () => void }) {
  return <div className="icon-btn" onClick={onClick}>{icon}</div>
}
```

```tsx
// 🟢 Substitutable: forwards the native contract, so it drops in anywhere a <button> would.
const IconButton = ({ icon, ...props }: { icon: ReactNode } & React.ComponentProps<'button'>) => (
  <button className="icon-btn" {...props}>{icon}</button>
)
// keyboard, focus, disabled, aria-*, ref (React 19 ref-as-prop) all work because they pass through.
```

> 🟢 **Best practice** — when a component stands in for a native element, extend
> `React.ComponentProps<'button'>` (or `'input'`, `'a'`, …) and spread the rest through. You inherit
> accessibility, keyboard behavior, and `ref` for free, and callers can treat your component as the
> thing it claims to be. A `<div onClick>` that impersonates a button fails LSP *and* accessibility at
> once — see [the a11y notes](quality).

---

## Interface Segregation: no fat prop bags

Don't force a component to accept props it doesn't use, and don't make callers supply a giant config
object when they need three fields. A component that takes fifteen optional props is usually several
components wearing a trench coat.

```tsx
// 🔴 One component, one giant prop bag; callers pass undefined for the half they don't use.
<DataTable
  rows={rows} columns={cols} sortable filterable paginated exportable
  editable selectable virtualized stickyHeader onSort={...} onFilter={...}
  onExport={...} onEdit={...} onSelect={...} pageSize={20} density="compact"
/>
```

```tsx
// 🟢 Compose the capabilities you actually need; each part has a small, honest interface.
<DataTable rows={rows} columns={cols}>
  <DataTable.Toolbar><ExportButton /><DensityToggle /></DataTable.Toolbar>
  <DataTable.Pagination pageSize={20} />
</DataTable>
```

> 🟡 **Optimization** — the fat-props form is fine for a small, stable component; segregating a
> three-prop component is over-engineering. **When NOT to split:** until the prop list actually hurts —
> when callers routinely pass `undefined` for whole feature-groups, or when the props form obvious
> clusters (sorting props, pagination props). That clustering is the signal to break the interface up,
> often via [compound components](#polymorphism-in-react).

---

## Dependency Inversion: depend on abstractions, not concretions

High-level components shouldn't import low-level details directly; both should depend on an abstraction.
In React this is the difference between a component that `import`s a concrete API client (and now can't
be tested or reused) and one that receives its dependencies through **props, context, or a hook**.

```tsx
// 🔴 The component is welded to fetch + a URL + the shape of the response.
function Notifications() {
  const [items, setItems] = useState([])
  useEffect(() => {
    fetch('https://api.acme.com/v2/notifications', { headers: authHeaders() })
      .then((r) => r.json()).then(setItems)
  }, [])
  return <List items={items} />
}
```

```tsx
// 🟢 Depends on an abstraction (a hook); the transport is swappable and the component is testable.
function Notifications() {
  const { data: items = [] } = useNotifications()   // could be REST, GraphQL, a mock in tests
  return <List items={items} />
}
```

> 🟢 **Best practice** — put I/O and third-party SDKs behind a hook or a small module boundary, and let
> components depend on that seam. Tests inject a fake, the transport can change (REST → GraphQL → RSC
> loader) without touching the UI, and the component's dependency is a *name*, not a *URL*. This is the
> [Data Layer](data-layer) principle stated as a design rule.

> 🔴 **Advanced / gotcha** — Context is the DIP tool for cross-cutting dependencies (the current user,
> a theme, an API client), but every value change re-renders every consumer — see the measured
> [fan-out on the state page](state-management). Invert dependencies through context for things that
> change *rarely*; for hot dependencies, pass a stable object or use a selector store.

---

## Composition over configuration

The most React-specific principle, and the one that resolves most "how should this component's API
look" arguments: prefer **giving components to a component** (`children`, slots, render props) over
**giving it flags that describe what to render**. Configuration props multiply (`showHeader`,
`headerText`, `headerIcon`, `headerAlign`…); composition doesn't.

```tsx
// 🔴 Configuration creep — every new header need is another prop.
<Modal title="Delete?" showCloseButton closeIcon={<X/>} footerAlign="right"
       confirmText="Delete" cancelText="Keep" danger onConfirm={...} onCancel={...} />
```

```tsx
// 🟢 Composition — the caller supplies structure; the Modal supplies behavior.
<Modal onClose={close}>
  <Modal.Header>Delete?</Modal.Header>
  <Modal.Body>This can't be undone.</Modal.Body>
  <Modal.Footer>
    <Button variant="ghost" onClick={close}>Keep</Button>
    <Button variant="danger" onClick={onConfirm}>Delete</Button>
  </Modal.Footer>
</Modal>
```

> 🟢 **Best practice** — when a prop exists only to control *what* a component renders (`showX`,
> `xText`, `xPosition`), that's usually a slot in disguise. Hand the caller `children` or named slots
> and let them compose. You stop predicting every need, and the component's API stops growing.

> 🟡 **Optimization** — composition has a cost: a fully-composable `<Modal.Header/.Body/.Footer>` is
> more ceremony than `<Modal title=…/>` for the 90% case. **When NOT to:** for a component with one
> obvious shape and no variation, a couple of props are clearer than compound children. Offer
> composition when variation *appears*, not preemptively.

---

## Polymorphism in React

"Same interface, different behavior" shows up in React as a few concrete patterns. Reach for them
instead of duplicating components or branching on a `type`.

**The `as` / polymorphic prop** — one component, many rendered elements, same styling contract:

```tsx
// 🟢 <Text as="h1">, <Text as="label">, <Text as="span"> — one API, correct semantics each time.
function Text<E extends React.ElementType = 'span'>(
  { as, ...props }: { as?: E } & React.ComponentPropsWithoutRef<E>,
) {
  const Tag = as ?? 'span'
  return <Tag {...props} />
}
```

**Compound components** — a family that shares implicit state through context (`<Tabs><Tab/></Tabs>`),
the polymorphic answer to a fat prop bag.

**Render props / children-as-function** — the caller supplies the behavior for each item:

```tsx
// 🟢 <List items={users}>{(u) => <UserRow user={u} />}</List> — List owns iteration, caller owns the row.
function List<T>({ items, children }: { items: T[]; children: (item: T) => ReactNode }) {
  return <ul>{items.map((it, i) => <li key={keyOf(it) ?? i}>{children(it)}</li>)}</ul>
}
```

> 🔴 **Advanced / gotcha** — a polymorphic `as` component is genuinely advanced to *type* well
> (`ElementType`, `ComponentPropsWithoutRef`, forwarding `ref` across the generic). It's a 🔴 tool:
> reach for it for a real design-system primitive (`Text`, `Box`, `Button`), not for a one-off. For a
> single component that occasionally renders an `<a>` vs a `<button>`, a plain conditional is simpler
> and honest. See [typing generic/polymorphic components](ts-react).

---

## Data-driven over conditional

The everyday form of Open/Closed. When rendering branches on a value, a **lookup table or a config
array** is usually clearer than an `if`/`switch` ladder, and it's closed for modification — new cases
are new data.

```tsx
// 🔴 Adding a status means editing this ladder and hoping the others still work.
function StatusBadge({ status }: { status: Status }) {
  if (status === 'active') return <Badge color="green">Active</Badge>
  if (status === 'pending') return <Badge color="amber">Pending</Badge>
  if (status === 'closed') return <Badge color="gray">Closed</Badge>
  return null
}
```

```tsx
// 🟢 New status = new row. The component never changes.
const STATUS: Record<Status, { color: string; label: string }> = {
  active: { color: 'green', label: 'Active' },
  pending: { color: 'amber', label: 'Pending' },
  closed: { color: 'gray', label: 'Closed' },
}
function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status]
  return s ? <Badge color={s.color}>{s.label}</Badge> : null
}
```

> 🟢 **Best practice** — a `Record<Key, Config>` typed by a union gives you exhaustiveness for free:
> add a member to `Status` and TypeScript flags the table as incomplete. Conditionals give you no such
> safety. This is the pattern to prefer for variants, routes, feature flags, and form-field registries.

> 🟡 **Optimization** — a two-branch conditional is not a crisis; don't build a config system for an
> `isLoggedIn ? … : …`. The table earns its keep at ~3+ cases, when the branches share a shape, or when
> the set will grow. **When NOT to:** genuinely divergent branches that share no structure — force-fitting
> those into a table obscures more than it saves.

---

## How to use these

These aren't a checklist to satisfy; they're **forces to name**. In review, instead of "this feels
off," you can say *"this fails Open/Closed — a new variant edits shared code"* or *"this is a fat
interface; segregate it into compound components."* Precise names make the fix obvious and make
disagreements about design concrete instead of aesthetic.

The through-line: **push change to the edges.** Data-driven tables, composition, and dependency
inversion all do the same thing — they turn "edit working code and hope" into "add new code that
can't break the old." That's the whole game.

## Sources

- [react.dev — Thinking in React, Passing props, Passing data with context](https://react.dev/learn)
- [react.dev — Reusing logic with custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Robert C. Martin, *the SOLID principles* (original class-oriented framing) — translated to components here.
- [Kent C. Dodds — Compound components / inversion of control patterns](https://kentcdodds.com/blog)
- [React TypeScript Cheatsheet — polymorphic components](https://react-typescript-cheatsheet.netlify.app/)
