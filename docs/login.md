# Login Module

This document explains how the **login feature** works in the chat application. It covers:

1. The **routes** (how the browser talks to the server)
2. The **template** (`views/index.ejs`) (what the user sees)
3. The **data flow** (step-by-step what happens when you log in or log out)
4. **Middleware and validation**
5. **Recent fixes and improvements**

No diagrams are used — everything is explained in plain text.

---

## 1. Routes Overview

All login routes are mounted under `/` (root) in `src/index.ts` and defined in `src/router/login.ts`.

| Method | Path | Controller | What It Does |
|--------|------|------------|--------------|
| `GET` | `/` | `getLogin` | Show the login page (or redirect to inbox if already logged in) |
| `POST` | `/` | `login` | Authenticate user and create session cookie |
| `DELETE` | `/` | `logout` | Clear session cookie and log out |

---

## 2. Route Details

### 2.1 `GET /` — Show Login Page

**Controller:** `getLogin` in `src/controllers/login.ts`

**What happens step-by-step:**

1. Checks if `req.user` exists (set by `checkAuthentication` middleware).
2. If user is already authenticated, redirects to `/inbox`.
3. Otherwise, renders the `index.ejs` template with empty data and no errors.

---

### 2.2 `POST /` — Login

**Controller:** `login` in `src/controllers/login.ts`

**What happens step-by-step:**

1. Receives `username` (email or mobile) and `password` from the request body.
2. Searches the `User` collection where `email` OR `mobile` matches the username.
3. If no user found, throws 404 error: "Requested user was not found."
4. Verifies the password using `argon2` (`verify` function).
5. If password is invalid, throws 400 error: "Invalid Username or Password. Try again."
6. Builds a user object with `id`, `username`, `email`, `mobile`, `public_id`, `url`, `role`.
7. Signs a JWT token with the user object and `JWT_SECRET`.
8. Sets an HTTP-only, signed cookie with the token (`COOKIE_NAME`).
9. Sets `res.locals.loginUser` for template use.
10. Redirects to `/inbox` on success.

**On failure (invalid credentials, user not found, etc.):**
- Re-renders `index.ejs` with the submitted `username` preserved in `data.username`.
- Shows error message in `errors.common.msg`.

---

### 2.3 `DELETE /` — Logout

**Controller:** `logout` in `src/controllers/login.ts`

**What happens step-by-step:**

1. Clears the `COOKIE_NAME` cookie from the client.
2. Returns JSON: `{ "message": "Logout successful." }`

**Frontend:** The header template calls `logout()` which sends a DELETE request to `/`, shows a toast, then redirects to `/` after 1 second.

---

## 3. Template: `views/index.ejs`

The login page template is an EJS file that mixes HTML with server-side JavaScript tags.

### 3.1 Includes (Shared Parts)

| Include | File | Purpose |
|---------|------|---------|
| Header | `./partials/header.ejs` | HTML `<head>`, navigation menu, logout button |
| Footer | `./partials/footer.ejs` | Closing `</body>` and `</html>` tags |

---

### 3.2 Login Form

```ejs
<form method="post" action="/">
  <input type="text" name="username" placeholder="enter mobile or email" value="<%= data.username %>" />
  <% if (errors.username) { %>
    <p class="error show">
      <%= errors.username.msg %>
    </p>
  <% } %>
  <input type="password" name="password" placeholder="enter password" />
  <% if (errors.password) { %>
    <p class="error show">
      <%= errors.password.msg %>
    </p>
  <% } %>
  <% if (errors.common) { %>
    <p class="error show">
      <%= errors.common.msg %>
    </p>
  <% } %>
  <input type="submit" value="Login" />
</form>
```

**Fields:**
- `username` (text): Accepts mobile number or email address. Pre-filled with `data.username` on error.
- `password` (password): User's password.

**Error display:**
- `errors.username`: Validation error from `loginValidatorHandler` (e.g., "Mobile number or email is required.")
- `errors.password`: Validation error from `loginValidatorHandler` (e.g., "Password is required.")
- `errors.common`: Server-side error (e.g., user not found, invalid password)

Each error is rendered in a `<p class="error show">` tag.

---

## 4. JavaScript Functions

The login page itself has no custom JavaScript functions for login (form submission is handled by standard HTML POST). However, the shared `header.ejs` includes a `logout()` function:

```javascript
function logout() {
  fetch("/", {
    method: "DELETE",
  });
  logoutToast.showToast();
  setTimeout(() => {
    window.location.replace("/");
  }, 1000);
}
```

---

## 5. Middleware and Validation

### `loginValidator`

**File:** `src/middlewares/login/loginValidator.ts`

Uses `express-validator` to validate the request body:

| Field | Rule | Error Message |
|-------|------|---------------|
| `username` | `isLength({ min: 1 })` | "Mobile number or email is required." |
| `password` | `isLength({ min: 1 })` | "Password is required." |

### `loginValidatorHandler`

**File:** `src/middlewares/login/loginValidator.ts`

**What it does:**

1. Collects validation results from `express-validator`.
2. If there are errors, re-renders `index.ejs` with:
   - `data.username`: The submitted username (pre-fills the input).
   - `errors`: The mapped validation errors.
3. If no errors, calls `next()` to proceed to the `login` controller.

---

## 6. Template Variables

These variables are available inside `index.ejs`:

| Variable | Where It Comes From | What It Contains |
|----------|---------------------|------------------|
| `data` | Passed by controller/middleware | `{ username: string }` — pre-filled username on error |
| `errors` | Passed by controller/middleware | `{ common: { msg: string }, username: { msg: string }, password: { msg: string } }` — validation/server errors |
| `loginUser` | `res.locals.loginUser` (set by auth middleware) | Logged-in user object (for header menu) |

---

## 7. Data Flow Example

### Step 1 — Open login page:
- Browser requests `GET /`
- `checkAuthentication` middleware checks for a valid cookie
- If no token, `getLogin` renders `index.ejs` with empty form
- User sees the login form

### Step 2 — Submit login:
- User enters username and password, clicks Login
- Browser sends `POST /` with form data
- `loginValidator` checks that both fields are non-empty
- `loginValidatorHandler` re-renders form with errors if validation fails
- `login` controller runs:
  1. Finds user by email or mobile
  2. Verifies password with argon2
  3. Creates JWT token
  4. Sets signed HTTP-only cookie
  5. Redirects to `/inbox`

### Step 3 — Logout:
- User clicks Logout in the menu
- `logout()` JavaScript function sends `DELETE /`
- Server clears the cookie
- Browser shows toast and redirects to `/`

---

## 8. Authentication Middleware

### `checkAuthentication` (soft auth-gate)

**File:** `src/middlewares/handleAuth.ts`

- Reads the signed cookie `COOKIE_NAME`
- If no token, calls `next()` and continues (user is not authenticated)
- If token exists, verifies the JWT signature
- If valid, sets `req.user` and `res.locals.loginUser`
- If invalid or expired, silently ignores and continues

### `requireAuth` (hard auth-gate)

**File:** `src/middlewares/handleAuth.ts`

- If no `req.user`, redirects to `/` (for HTML requests) or returns 401 JSON (for API requests)
- If the user's role is not in the allowed list, HTML requests get the error page (403) and API requests get 403 JSON
- Otherwise calls `next()`

These are applied in `src/index.ts`:
```typescript
app.use("/", decorateHtmlResponse("Login"), checkAuthentication, loginRouter);
app.use(
  "/users",
  decorateHtmlResponse("Users"),
  checkAuthentication,
  requireAuth(["admin"]),
  userRouter,
);
app.use(
  "/inbox",
  decorateHtmlResponse("Inbox"),
  checkAuthentication,
  requireAuth(["admin", "user"]),
  inboxRouter,
);
```

For full details on the authorization system (roles, conversation-level
authorization, and the route protection matrix), see
**`docs/authorization.md`**. For the plain-text route map, see
**`docs/routes.md`**.

---

## 9. File Structure Summary

```
src/
├── controllers/
│   ├── login.ts          # getLogin, login, logout
│   ├── inbox.ts          # getInbox, searchUser, addConversation, getMessages, deleteConversation, searchConversation
│   ├── sendMessage.ts    # sendMessage (with socket emit)
│   └── user.ts           # getUsers, addUser, removeUser
├── middlewares/
│   ├── login/
│   │   └── loginValidator.ts  # express-validator rules + handler
│   ├── users/
│   │   ├── avatarUpload.ts    # Multer for avatar uploads
│   │   └── userValidator.ts   # express-validator rules + handler
│   ├── chat/
│   │   ├── attachmentUpload.ts    # Multer for chat attachments
│   │   └── conversationAuth.ts    # conversationParticipant authorization middleware
│   ├── decorateHtmlResponse.ts
│   ├── errorHandler.ts
│   └── handleAuth.ts      # checkAuthentication, requireAuth
├── models/
│   ├── conversation.ts   # creator, participant, last_updated
│   ├── message.ts        # text, sender, receiver, conversations, attachment[{ public_id, url, resource_type }]
│   └── user.ts           # name, email, mobile, avatar, password, role
├── router/
│   ├── inbox.ts          # Route definitions
│   ├── login.ts          # Route definitions
│   └── user.ts           # Route definitions
├── socket.ts             # Socket.io setup (initIo, getIo)
└── index.ts              # App entry, initializes socket

views/
├── index.ejs             # Login page template
├── inbox.ejs             # Main inbox template
├── users.ejs             # User management template
└── partials/
    ├── add-conversation-modal.ejs
    ├── footer.ejs
    ├── header.ejs
    └── user.modal.ejs

public/
├── images/
├── js/
│   ├── moment.js
│   └── toastify.js
└── stylesheets/
    └── style.css
```

---

## 10. Known Issues / Future Work

1. **Username field accepts both email and mobile** — but there's no separate validation to distinguish between them
2. **Password reset** — not implemented (no forgot password flow)
3. **Remember me** — not implemented (cookie uses fixed maxAge)
4. **Login rate limiting** — not implemented (brute-force protection missing)
5. **Email verification** — not implemented (users can log in immediately after registration)