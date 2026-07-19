# Front-End Security

The front end can't be *trusted* — anything it enforces, an attacker can bypass by talking to your API
directly with curl. So the first rule reframes the whole page: **client-side security is about protecting
the user in their browser, not about protecting your data.** Data protection lives on the server, always.
What the front end owns is real and specific: where the token lives, what the UI reveals, and what
untrusted content it renders.

> 🟢 **Best practice** — every authorization check in the UI is a *convenience and a UX affordance*, not
> a security boundary. The server must re-check every permission on every request. If the only thing
> stopping a user from deleting a record is a hidden button, it isn't stopped. Treat client checks as
> "don't show what won't work," and back all of them server-side.

---

## Where the auth token goes

This is the decision the front end genuinely owns, and it's mostly about surviving XSS.

| Storage | Survives refresh | Readable by JS (XSS-exposed) | Verdict |
|---|---|---|---|
| In-memory (a variable / state) | ❌ (lost on reload) | ❌ | Most secure; pair with a refresh flow |
| `HttpOnly` `Secure` cookie | ✅ | ❌ (JS can't read it) | **Recommended default** |
| `localStorage` / `sessionStorage` | ✅ | ✅ **any XSS steals it** | Avoid for tokens |

```ts
// 🔴 The convenient, common, wrong choice: one XSS anywhere = full account takeover.
localStorage.setItem('access_token', token)

// 🟢 The server sets an HttpOnly, Secure, SameSite cookie; JS never touches the token.
//    Set-Cookie: access_token=…; HttpOnly; Secure; SameSite=Lax; Path=/
//    The browser attaches it automatically; your fetch just needs credentials.
await fetch('/api/me', { credentials: 'include' })
```

> 🟢 **Best practice** — store the access token in an `HttpOnly` + `Secure` + `SameSite` cookie set by
> the server, or hold it in memory with a silent-refresh flow. **Never `localStorage`.** localStorage is
> readable by any script that runs on your page, so a single XSS — including one from a compromised npm
> dependency — exfiltrates every user's token. The "it's easier" of localStorage is paid for in the one
> breach that empties it.

> 🔴 **Advanced / gotcha** — the user object is fine as global state (see
> [state management](state-management)); the *token* is not the user object. Keep the token out of your
> Redux/Zustand store and out of anything that serializes to disk or a devtools snapshot. Model "who is
> logged in" as client state; let the credential itself live in the cookie.

---

## Authorization: role-based vs permission-based

Two models, and real apps need both. Encode them as a component so gating is declarative, not scattered
`if (user.role === 'ADMIN')` littered through the tree.

**Role-based (RBAC)** — coarse: a user *is* an ADMIN or a USER.

**Permission-based (PBAC / ABAC)** — fine and contextual: *can this user delete **this** comment?* —
which usually depends on ownership, not a static role.

```tsx
type Role = 'ADMIN' | 'USER'
type Policy = 'comment:delete' | 'post:publish'

// One authorization primitive that handles both roles and per-resource policies.
function Authorization({
  allowedRoles,
  policyCheck,
  children,
  fallback = null,
}: {
  allowedRoles?: Role[]
  policyCheck?: boolean          // caller computes it: e.g. comment.authorId === user.id
  children: ReactNode
  fallback?: ReactNode
}) {
  const { user } = useAuth()
  const roleOk = !allowedRoles || (user && allowedRoles.includes(user.role))
  const policyOk = policyCheck ?? true
  return roleOk && policyOk ? <>{children}</> : <>{fallback}</>
}

// role gate:
<Authorization allowedRoles={['ADMIN']}><AdminPanel /></Authorization>
// per-resource policy gate (the important one):
<Authorization policyCheck={comment.authorId === user.id}>
  <DeleteButton commentId={comment.id} />
</Authorization>
```

> 🟢 **Best practice** — express authorization as one declarative component (or a `useAuthorization`
> hook) taking allowed roles and/or a computed policy boolean. Centralizing it means the rules are
> auditable in one place and consistent everywhere — far safer than hand-rolled role checks sprinkled
> across components, where one forgotten check is a leak.

> 🔴 **Advanced / gotcha** — role checks (`role === 'ADMIN'`) are easy; **ownership** checks are where
> real apps leak. "Only the author can delete this comment" is a *policy*, evaluated against the specific
> resource, and it must be enforced on the server for that exact resource — the client policy just hides
> the button. An IDOR (changing the id in the request to act on someone else's resource) is the classic
> exploit when the server trusts the client's gating.

---

## Protecting routes

An unauthenticated user hitting a private URL should be redirected, not shown a broken page that fetches
401s. Gate at the route layer.

```tsx
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
}
```

> 🟢 **Best practice** — wrap private route trees in a `ProtectedRoute` that redirects to login and
> preserves the intended destination (`state.from`) so the user lands where they meant to after signing
> in. Remember [focus management on route change](quality) applies here too. And again: the route guard is
> UX — the API behind those routes must still reject the unauthenticated request on its own.

---

## XSS: the front end's biggest real exposure

Cross-site scripting is where the client genuinely can create a vulnerability. React escapes text by
default — `{userContent}` in JSX is safe — so the risk lives in the escape hatches.

```tsx
// 🔴 The one function name that should make you stop: renders raw HTML, executes any <script>.
<div dangerouslySetInnerHTML={{ __html: userSuppliedHtml }} />

// 🟢 If you must render user HTML (rich text, markdown), sanitize it first.
import DOMPurify from 'dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userSuppliedHtml) }} />
```

> 🔴 **Advanced / gotcha** — `dangerouslySetInnerHTML` is named to make you flinch; treat every use as a
> code review stop. Sanitize with a vetted library (DOMPurify), never a hand-rolled regex — HTML parsing
> is full of bypass tricks a regex won't catch. Other sinks to audit: a `href={userUrl}` that could be
> `javascript:…` (validate the protocol), and rendering user content into a `<script>`/`<style>` or an
> event-handler string.

> 🟢 **Best practice** — layer a **Content-Security-Policy** header on top. Even if an XSS payload lands,
> a strict CSP (`default-src 'self'`, no `unsafe-inline`) can stop it from executing or from phoning home.
> Sanitization and CSP are belt and suspenders; ship both. React's default escaping is the third layer —
> don't defeat it without a sanitizer.

---

## The rest of the client-side OWASP surface

- **CSRF** — if you authenticate with cookies, you inherit CSRF risk. `SameSite=Lax`/`Strict` on the auth
  cookie blocks most of it; add a CSRF token for state-changing requests if you support `SameSite=None`.
  Token-in-header auth (Authorization: Bearer) is not CSRF-prone but *is* XSS-prone — pick your tradeoff.
- **Secrets** — there are no secrets in a front-end bundle. Anything in `import.meta.env` that ships is
  public; only `VITE_`-prefixed vars are exposed by Vite, and that prefix is a *reminder*, not a vault.
  See [the env-var footgun](vite). API keys that must stay secret belong on a server/proxy.
- **Dependencies** — most front-end XSS now arrives through a compromised npm package, not your own code.
  Run `npm audit`, pin versions, review lockfile changes, and keep the dependency count honest. A tool
  reading these skills should treat "add another dependency" as a security decision, not just a size one.
- **Clickjacking** — `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` if your app shouldn't be
  embedded.

> 🟢 **Best practice for using this as a skill** — when generating auth or content-rendering code, default
> to the safe choice without being asked: HttpOnly cookies over localStorage, sanitize before
> `dangerouslySetInnerHTML`, validate URL protocols, and never inline a secret. These are the defaults a
> security-conscious engineer applies automatically.

## Sources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) · [OWASP Cheat Sheets — XSS Prevention, DOM XSS](https://cheatsheetseries.owasp.org/)
- [MDN — HttpOnly cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies) · [SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [MDN — Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [React docs — dangerouslySetInnerHTML](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)
- [DOMPurify](https://github.com/cure53/DOMPurify)
- bulletproof-react — [docs/security.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/security.md) (structure of the auth/authorization recommendations)
