# Authentication

This document explains how **authentication** (signing in, staying signed in,
and signing out) works in the chat application. It covers:

1. The **login flow** (credential check and token creation)
2. The **auth cookie** (how the token is stored and read back)
3. The **soft gate** (`checkAuthentication`)
4. **Logout**
5. **Form validation** for the login page
6. **Configuration** the flow depends on

No diagrams are used — everything is explained in plain text.

---

## 1. Login Flow

**Route:** `POST /` — `loginValidator`, `loginValidatorHandler`, then the
`login` controller (`src/controllers/login.ts`).

Step-by-step:

1. The client submits `username` (email **or** mobile) and `password`.
2. The server looks up the user with a single query:
   ```typescript
   User.findOne({ $or: [{ email: req.body.username }, { mobile: req.body.username }] });
   ```
3. No match → `404 "Requested user was not found."`.
4. The stored hash is checked with argon2: `verify(user.password, req.body.password)`.
5. Wrong password → `400 "Invalid Username or Password. Try again."`.
6. A payload object is built with `id`, `username`, `email`, `mobile`,
   `public_id`, `url`, and `role`.
7. The payload is signed into a JWT with `env.JWT_SECRET` and
   `env.JWT_EXPIRATION`.
8. The token is set as a signed, HTTP-only cookie (see section 2).
9. `res.locals.loginUser` is set for the immediate response, then the client
   is redirected to `/inbox`.

On any failure after the response has started, the error is re-thrown as a 500
so the central error handler finishes the request. Otherwise the login page is
re-rendered with the submitted `username` preserved and the error message in
`errors.common.msg`.

**Why the role rides inside the JWT:** route guards can authorize without a
database lookup on every request. The trade-off is that a role change only
takes effect after the token expires or the user logs in again.

---

## 2. The Auth Cookie

Set in the `login` controller:

```typescript
res.cookie(env.COOKIE_NAME, token, {
  httpOnly: true,
  signed: true,
  maxAge: env.COOKIE_MAX_AGE,
});
```

| Property | Why it is set |
|----------|---------------|
| `httpOnly` | The token is not readable from client-side JavaScript, so an XSS bug cannot steal it directly. |
| `signed` | `cookie-parser` verifies the signature with `env.COOKIE_SECRET` (`src/index.ts`); a tampered cookie fails verification and is treated as absent. |
| `maxAge` | Fixed lifetime from `env.COOKIE_MAX_AGE`; there is no sliding refresh or "remember me". |

The raw cookie value is the signed token. Reading it back gives the unsigned
JWT via `req.signedCookies[env.COOKIE_NAME]`.

---

## 3. Soft Gate: `checkAuthentication`

**File:** `src/middlewares/handleAuth.ts` — mounted on every router in
`src/index.ts`.

Behavior:

1. No cookie (or a non-string value) → `next()`; the request continues
   unauthenticated.
2. `jwt.verify(token, env.JWT_SECRET)`:
   - If the decoded value is a string (token without a payload) → `next()`.
   - Otherwise `req.user = decoded`, and `res.locals.loginUser` is set when
     `res.locals.html` is true (HTML responses only).
3. Any verification error (expired, bad signature) → `next()` silently.

**Why it is soft:** public pages such as the login form must render even
without a session, and an expired cookie must not produce an error on every
page. Blocking is the job of the hard gate — see `docs/authorization.md`.

---

## 4. Logout

**Route:** `DELETE /` — `logout` controller.

```typescript
res.clearCookie(env.COOKIE_NAME);
res.json({ message: "Logout successful." });
```

The header partial (`views/partials/header.ejs`) calls this with `fetch`,
shows the "You are being logged out..." toast, then redirects to `/` after
1 second. The server-side token is not revoked; it simply stops being sent.

---

## 5. Form Validation

**File:** `src/middlewares/login/loginValidator.ts`

| Field | Rule | Error message |
|-------|------|---------------|
| `username` | `isLength({ min: 1 })` | "Mobile number or email is required." |
| `password` | `isLength({ min: 1 })` | "Password is required." |

`loginValidatorHandler` re-renders `index.ejs` with the mapped errors when
validation fails, otherwise calls `next()`. Validation runs before the
controller so invalid input never reaches the credential check.

---

## 6. Configuration

All values come from `src/config/env.ts` and are validated at startup (a
missing secret or invalid port aborts the process before the server listens):

| Variable | Used for |
|----------|----------|
| `JWT_SECRET` | Signing and verifying the token |
| `JWT_EXPIRATION` | Token lifetime |
| `COOKIE_NAME` | Cookie name |
| `COOKIE_MAX_AGE` | Cookie lifetime |
| `COOKIE_SECRET` | Cookie signature verification |

---

## 7. Known Limitations

- **No token revocation:** logout clears the cookie, but a stolen token is
  valid until it expires.
- **No rate limiting** on `POST /`, so brute-force protection is missing.
- **No password reset or email/mobile verification.**
- **No "remember me":** the cookie lifetime is fixed from the environment.

---

## See Also

- `docs/authorization.md` — what happens after authentication (roles and
  conversation membership checks).
- `docs/login.md` — the login page and template details.
- `docs/routes.md` — the full route map and middleware chains.
