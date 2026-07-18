# Forms

Forms are where three hard things collide: local UI state, async submission, and validation you can't trust. React 19 changed the default answer to the second one — `<form action>` + `useActionState` now own pending/error state that everyone used to hand-roll (see [React 19](react-19#actions--the-organizing-idea) for the mechanics). This page is about the *decisions*: whether an input is controlled, when the per-keystroke re-render actually costs you anything, where validation lives, and the point at which a form library stops being overhead and starts paying rent.

The through-line: **most forms should be uncontrolled**, read once on submit via `FormData`; reach for controlled inputs only where a field's *current* value drives other UI. That's the opposite of the tutorial default, and it's the single highest-leverage decision on this page.

---

## Label every input — this one is not negotiable

Before any performance talk: an input without a programmatically associated label is broken for screen readers, breaks click-to-focus, and breaks autofill. It is a correctness bug, not a polish item.

```tsx
// BAD — placeholder is not a label; it vanishes on focus and is invisible to a11y tools
<input placeholder="Email" />

// GOOD — explicit association via htmlFor/id
<label htmlFor="email">Email</label>
<input id="email" name="email" type="email" />

// GOOD — implicit association by wrapping (no id needed)
<label>
  Email
  <input name="email" type="email" />
</label>
```

> 🟢 **Best practice** — every input has an associated `<label>` (via `htmlFor`/`id` or by wrapping), and every input that carries data has a `name`. The `name` is not optional decoration: it's the key `FormData` and `<form action>` read by. A field with no `name` is invisible to native submission — a silent data-loss bug.

Native attributes do real work for free: `type="email"`, `required`, `minLength`, `autoComplete="email"`. They drive mobile keyboards, password managers, and the browser's built-in validation UI. Don't reimplement in JS what the platform already does.

---

## Controlled vs uncontrolled — the core decision

### The problem

A **controlled** input has its `value` driven by React state: `value={x} onChange={e => setX(...)}`. Every keystroke is a `setState`, and every `setState` is a [render](fundamentals#render-vs-commit) of the component holding that state — plus everything it renders that isn't memoized. On a login form nobody notices. On a 40-field settings page where the whole form is one component, every keystroke re-renders all 40 fields.

An **uncontrolled** input lets the DOM keep its own value. React writes an initial `defaultValue` and then stays out of the way; you read the value at submit time via a ref or `FormData`. Typing causes **zero React renders**.

### Why React behaves this way

`value={x}` is a promise to React: "this input displays exactly `x`, always." To keep that promise, React must re-render on every change so the new `x` flows back into the DOM. That re-render is the mechanism, not a bug — it's what makes the value a single source of truth you can validate, transform, or mirror elsewhere mid-typing. The cost is inherent to the guarantee. See [render vs commit](fundamentals#render-vs-commit) for why "re-render" here means running the function, not rebuilding the DOM.

### A naive example — everything controlled, one big component

```tsx
// Every keystroke in ANY field re-renders the whole form and all its children.
function ProfileForm() {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  // ...37 more fields...

  return (
    <form onSubmit={/* ... */}>
      <input value={name} onChange={e => setName(e.currentTarget.value)} />
      <textarea value={bio} onChange={e => setBio(e.currentTarget.value)} />
      <input value={email} onChange={e => setEmail(e.currentTarget.value)} />
      <ExpensiveMarkdownPreview source={bio} /> {/* re-renders on every keystroke, everywhere */}
      {/* ... */}
    </form>
  );
}
```

### A better example — uncontrolled, read once on submit

```tsx
function ProfileForm({ save }: { save: (data: FormData) => Promise<void> }) {
  return (
    <form action={save}>            {/* React 19: async action, see below */}
      <label htmlFor="name">Name</label>
      <input id="name" name="name" defaultValue="" />

      <label htmlFor="bio">Bio</label>
      <textarea id="bio" name="bio" defaultValue="" />

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" defaultValue="" />

      <button type="submit">Save</button>
    </form>
  );
}
// Typing produces zero re-renders. `save` receives a FormData with every named field.
```

### The measured cost, honestly

The per-keystroke re-render is real but usually *cheap*. A plain function component re-running is fast; the DOM diff for an unchanged subtree is a no-op (React bails at the [reconciliation](fundamentals#reconciliation) step when the element is identical). The cost only becomes visible when a re-render drags an **expensive** child along — a heavy list, a chart, a markdown preview. In a small reproduction, an un-memoized child re-rendered **11 times** across 10 parent updates; wrapping it in `React.memo` cut that to **1** (measured on React 19 + jsdom; your numbers will differ in production).

> 🔴 **Advanced / gotcha** — the controlled-input re-render cost. It is easy to *over-fear* this. A form of cheap inputs stays under the [INP "good" threshold of 200ms](https://web.dev/articles/inp) no matter how you type; controlled is perfectly fine there. It only bites when (a) the form is large *and* (b) a keystroke re-renders something genuinely expensive. Measure with the Profiler before restructuring — don't rip out controlled inputs on a hunch.

> 🟡 **Optimization** — go uncontrolled for large or hot forms. It removes per-keystroke renders entirely, but you give up mid-typing derived UI (live validation, character counters, dependent fields) unless you add it back deliberately. Apply it when you've *seen* input lag or a Profiler flame graph, not by default on every form. For a 3-field form it buys nothing and costs you the ability to react to input.

If you need controlled behavior *and* an expensive neighbor, the surgical fix is to isolate the expensive part, not to abandon control:

> 🟡 **Optimization** — extract the expensive subtree into its own `React.memo`'d component so a field's keystrokes don't re-render it. This is a targeted move with a real cost (an extra component boundary, a props-equality check on every parent render, and `memo` only helps if the props are actually stable). Note that the [React Compiler](react-19#react-compiler-10) auto-memoizes this same subtree — same 11→1 result measured — so on a compiled codebase you often get the isolation for free and shouldn't hand-write the `memo`.

### Tradeoffs

| | Controlled | Uncontrolled |
|---|---|---|
| Source of truth | React state | The DOM |
| Renders per keystroke | 1 (+ un-memoized children) | 0 |
| Live derived UI (counter, live validation, dependent fields) | Trivial | Needs extra wiring |
| Read value | Already in state | On submit via `FormData`/ref |
| Reset / programmatic set | `setState` | `form.reset()` / imperative |
| Best fit | Small forms; fields that drive other UI | Large forms; write-then-submit |

### When NOT to go uncontrolled

- A field's current value must **drive other UI as you type** — a password-strength meter, a live search, a "slug" that mirrors a title, cross-field validation. That's controlled's whole reason to exist.
- You need to **transform input on the fly** — force uppercase, mask a phone number, clamp a number. The DOM can't do that without your `onChange`.
- The value is **owned elsewhere** (a store, a URL param) and the input just reflects it. That's controlled by definition.

A common middle ground: keep the form uncontrolled, but make the *one* field that needs live behavior controlled. You don't have to pick one mode for the whole form.

---

## Async submit — React 19 Actions, not hand-rolled state

Before React 19, "submit a form to a server" meant three or four `useState`s (`isPending`, `error`, maybe `success`) and a `try/catch/finally`, and almost everyone got the stale-response race wrong. React 19 folds all of that into `<form action>` + `useActionState`. The full treatment — signature order, the form auto-reset, the `useFormStatus` parent-only footgun — is on the [React 19 page](react-19#actions--the-organizing-idea); here's the shape as it applies to forms.

```tsx
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

type Errors = { email?: string; _form?: string } | null;

function NewsletterForm({ subscribe }: { subscribe: (email: string) => Promise<void> }) {
  const [errors, action] = useActionState(
    async (_prev: Errors, formData: FormData): Promise<Errors> => {
      const email = String(formData.get('email') ?? '');
      if (!email.includes('@')) return { email: 'Enter a valid email' };
      try {
        await subscribe(email);
        return null;                          // success — returned value becomes state
      } catch (err) {
        return { _form: (err as Error).message };
      }
    },
    null,
  );

  return (
    <form action={action}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" defaultValue="" />
      {errors?.email && <p role="alert">{errors.email}</p>}
      {errors?._form && <p role="alert">{errors._form}</p>}
      <SubmitButton />
    </form>
  );
}

// useFormStatus reads the ENCLOSING form — it must live in a child of <form>, never the same component.
function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>Subscribe</button>;
}
```

Two things make this the good default:

- The action receives a `FormData` — it pairs naturally with **uncontrolled** inputs. No per-field state to wire.
- **Return** validation errors as state; do **not** `throw` them. A `throw` from an action propagates to the nearest Error Boundary and cancels queued actions — it nukes the subtree for what should be an inline "invalid email" message. Throw only for genuinely exceptional failures you want a boundary to catch.

> 🟢 **Best practice** — for async submit in React 19, let an Action own pending/error/ordering state instead of hand-rolling `useState` flags. It eliminates the stale-response race (a slow first request resolving after a fast second one) by construction, and it degrades to a working native form submit if JS hasn't hydrated. This is a correctness rule, not an optimization — the hand-rolled version is where the race bugs live.

If you're not on React 19 (or the submit isn't a form — e.g. a mutation triggered by a button), a controlled `isPending` flag is still fine. The Action pattern specifically earns its keep for `<form>` submission.

---

## Validation — client for UX, server for truth

Two validations with different jobs. Client-side validation is a **UX affordance**: instant feedback, fewer round-trips, a nicer error experience. Server-side validation is the **security boundary**: it's the only one that can't be bypassed.

> 🟢 **Best practice** — never trust the client. Client validation can be disabled, edited in devtools, or skipped entirely by hitting your endpoint with `curl`. Every rule that protects data integrity (uniqueness, authorization, length limits, type coercion) must be enforced on the server regardless of what the client checks. Client validation is for the honest user's convenience; server validation is for everyone else.

The cleanest way to keep the two in sync is one schema, run in both places:

```ts
import { z } from 'zod';

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  age: z.coerce.number().int().min(13),   // FormData values are strings — coerce
});
export type Signup = z.infer<typeof SignupSchema>;
```

```tsx
// Client: parse FormData for instant feedback…
async function action(_prev: unknown, formData: FormData) {
  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return parsed.error.flatten().fieldErrors;
  await submitToServer(parsed.data);        // …server parses the SAME schema again, authoritatively
  return null;
}
```

Layer the platform underneath the schema: `required`, `type="email"`, `minLength`, `pattern` give you the browser's native validation UI and block obviously-bad submits before any JS runs. They're the free first line; the schema is the real one. And remember `FormData.get()` always returns strings (or `File`) — coerce numbers and booleans explicitly, or you'll compare `"13"` to `13` and get surprised.

---

## Typing form events

Full detail is on the [TypeScript with React 19 page](ts-react#typing-events); the form-specific essentials:

```tsx
// Let React infer from the handler position when you can:
<input onChange={e => setX(e.currentTarget.value)} /> // e: React.ChangeEvent<HTMLInputElement>

// When you must name the type, parameterize by the element:
function onSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const data = new FormData(e.currentTarget);   // currentTarget is typed HTMLFormElement
  const email = data.get('email') as string;
}

function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
  console.log(e.currentTarget.value);
}
```

> 🟢 **Best practice** — read `e.currentTarget`, not `e.target`. `currentTarget` is typed as the element the handler is attached to (so `.value` is there); `target` widens to `EventTarget` and needs a cast. On a `<form onSubmit>` handler, `e.currentTarget` is the `HTMLFormElement` you can hand straight to `new FormData(...)`.

---

## When a form library earns its weight

Plain state and React 19 Actions cover most forms. A library (react-hook-form, TanStack Form) is not free — it's a dependency, an API to learn, and a layer between you and the DOM. It earns its weight at a specific scale.

**How react-hook-form makes big forms fast:** it registers inputs as **uncontrolled** (refs under the hood) and subscribes to them individually, so a keystroke re-renders only the field that changed, not the form. That's the same uncontrolled-perf win described above, packaged with validation, field arrays, and error handling you'd otherwise hand-write.

| Situation | Reach for a library? |
|---|---|
| 1–5 fields, simple submit | No — plain state or `<form action>` |
| Large form, input lag from re-renders | Yes — RHF's per-field subscription is the fix, pre-built |
| Complex cross-field / async validation, wizards | Yes — dedicated validation + `resolver` (zod/yup) integration |
| Dynamic field arrays (add/remove rows) | Yes — `useFieldArray` is a lot to build by hand |
| End-to-end type safety from schema to fields | TanStack Form is strongest here |
| Server-driven submit, minimal client validation | No — React 19 Actions already do this |

> 🟡 **Optimization** — adopt react-hook-form / TanStack Form when a form is large, dynamic, or validation-heavy. The cost is a real dependency and its API surface; the payoff is the uncontrolled-perf win plus validation and field-array machinery you don't have to maintain. Don't add it to a three-field login form — there you're paying the cost for none of the benefit, and `<form action>` + a schema is less code.

> 🔴 **Advanced / gotcha** — mixing a form library's controlled mode with React's controlled inputs. react-hook-form's default (`register`) is uncontrolled and fast; its `Controller` wrapper exists for inputs that *require* controlled state (many component-library inputs, e.g. an MUI `Select`). `Controller` re-introduces the per-keystroke render for that field — which is fine and necessary, but people wrap *every* field in `Controller` out of habit and then wonder why the library "didn't help performance." Use `register` by default; reach for `Controller` only for inputs that can't be uncontrolled.

---

## Checklist

- Every input has an associated `<label>` and a `name`. 🟢
- Default to **uncontrolled** + `FormData`; make a field controlled only when its value drives other UI as you type.
- Don't rip out controlled inputs for perf without a Profiler measurement — the re-render is usually cheap.
- Async submit in React 19 → `<form action>` + `useActionState`; **return** validation errors, never `throw` them.
- `useFormStatus` must live in a **child** of `<form>`, not the component that renders it.
- Validate on the client for UX and on the server for truth — never trust the client. One schema (zod), run twice.
- Coerce `FormData` values — they're always strings.
- Read `e.currentTarget`, not `e.target`.
- Add a form library when the form is large, dynamic, or validation-heavy — not before.

## Sources

- React 19 `useActionState` — https://react.dev/reference/react/useActionState
- React 19 `useFormStatus` — https://react.dev/reference/react-dom/hooks/useFormStatus
- React `<form>` (Actions) — https://react.dev/reference/react-dom/components/form
- Controlled vs uncontrolled inputs — https://react.dev/reference/react-dom/components/input
- MDN `FormData` — https://developer.mozilla.org/en-US/docs/Web/API/FormData
- Web Vitals — Interaction to Next Paint (INP) — https://web.dev/articles/inp
- react-hook-form — https://react-hook-form.com/
- TanStack Form — https://tanstack.com/form/latest
- Zod — https://zod.dev/
