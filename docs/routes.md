# Route Map — All Application Routes

This document lists every route in the chat application, the middleware
chain that protects it, and the controller that handles it. It is written
in plain text (no diagrams) per project documentation convention.

## How Routes Are Mounted

In `src/index.ts`, Express mounts routers under path prefixes with shared
middleware applied before the router-specific handlers:

```
app.use("/",              decorateHtmlResponse, checkAuthentication, loginRouter);
app.use("/users",         decorateHtmlResponse, checkAuthentication, requireAuth(["admin"]), userRouter);
app.use("/inbox",         decorateHtmlResponse, checkAuthentication, requireAuth(["admin","user"]), inboxRouter);
```

Shared middleware applied to **all** routes under a prefix:
| Middleware | Purpose |
|------------|---------|
| `decorateHtmlResponse("Title")` | Sets `res.locals` template vars (title, loginUser, errors, data) |
| `checkAuthentication` | Soft auth gate — reads JWT cookie, sets `req.user` if valid, otherwise continues unauthenticated |
| `requireAuth([roles])` | Hard auth gate — rejects if not logged in (401/redirect) or wrong role (403) |

---

## Route Reference

### A. Login Routes — mounted under `/`

| Method | Path | Middleware (after shared) | Controller | Auth Required | Role | Description |
|--------|------|---------------------------|------------|---------------|------|-------------|
| GET | `/` | none | `getLogin` | No | any | Show login form; redirect to `/inbox` if already logged in |
| POST | `/` | `loginValidator`, `loginValidatorHandler` | `login` | No | any | Validate credentials, sign JWT, set auth cookie, redirect to `/inbox` |
| DELETE | `/` | none | `logout` | No | any | Clear auth cookie, return `{ message: "Logout successful." }` |

**Access:** Public (no login required). The soft `checkAuthentication` gate lets already-logged-in users skip the login page.

---

### B. User Management Routes — mounted under `/users`

| Method | Path | Middleware (after shared) | Controller | Auth Required | Role | Description |
|--------|------|---------------------------|------------|---------------|------|-------------|
| GET | `/users/` | none | `getUsers` | Yes | admin | List all users, render `users.ejs` |
| POST | `/users/` | `avatarUpload`, `addUserValidator`, `addUserValidatorHandler` | `addUser` | Yes | admin | Create a new user with optional avatar upload |
| DELETE | `/users/:id` | none | `removeUser` | Yes | admin | Delete a user by ID and their avatar file |

**Access:** Admin only. `requireAuth(["admin"])` blocks non-admin users (403).

---

### C. Inbox / Chat Routes — mounted under `/inbox`

| Method | Path | Middleware (after shared) | Controller | Auth Required | Role | Description |
|--------|------|---------------------------|------------|---------------|------|-------------|
| GET | `/inbox/` | none | `getInbox` | Yes | admin, user | Show inbox page with all user conversations |
| POST | `/inbox/search` | none | `searchUser` | Yes | admin, user | Search users by name/mobile/email |
| POST | `/inbox/conversation` | none | `addConversation` | Yes | admin, user | Create or find a 1-on-1 conversation |
| GET | `/inbox/messages/:conversationId` | `conversationParticipant` | `getMessages` | Yes | admin, user | Load messages in a conversation (participant only) |
| POST | `/inbox/message` | `attachmentUpload` | `sendMessage` | Yes | admin, user | Send a message (inline ownership check in controller) |
| DELETE | `/inbox/conversation/:conversationId` | `conversationParticipant` | `deleteConversation` | Yes | admin, user | Delete a conversation + messages, broadcast `conversation_deleted` |
| POST | `/inbox/search-conversation` | none | `searchConversation` | Yes | admin, user | Search within existing conversations |

**Access:** Any authenticated user (`admin` or `user`). Conversation-level routes additionally enforce that the user is a participant via `conversationParticipant` middleware.

---

### D. Conversation-Level Authorization (`conversationParticipant`)

**File:** `src/middlewares/chat/conversationAuth.ts`

Applied to routes that accept `:conversationId`. Verifies the authenticated user
is either the `creator` or `participant` of the conversation:

```
GET  /inbox/messages/:conversationId   → protected by conversationParticipant
DELETE /inbox/conversation/:conversationId → protected by conversationParticipant
POST  /inbox/message                    → inline ownership check in sendMessage controller
```

If the user is not a participant:
- HTML requests → `next(createError(403, ...))` → renders error page
- JSON/API requests → `403` JSON with `{ errors: { common: { msg } } }`

If the `conversationId` is not a valid ObjectId → `400` with "Invalid conversation ID format."

The matched conversation is attached to `req.conversation` so downstream
controllers can reuse it without a second database query.

---

## Authentication Flow (Plain Text)

```
1. Client submits username + password via POST /
2. Server finds user by email OR mobile
3. Password verified with argon2
4. JWT signed with { id, username, email, mobile, avatar, role }
5. JWT stored in signed, HTTP-only cookie (COOKIE_NAME)
6. Client redirected to /inbox
7. On subsequent requests, checkAuthentication reads the cookie and sets req.user
8. requireAuth checks the user is logged in and has an allowed role
9. conversationParticipant checks the user is part of the requested conversation
10. On logout (DELETE /), cookie is cleared
```

---

## Authorization Roles

| Role | Can Access | Description |
|------|------------|-------------|
| `user` | `/inbox/*` | Authenticated chat user — can view/send messages, create/delete their own conversations |
| `admin` | `/users/*`, `/inbox/*` | Administrator — can create/delete any user, plus all user capabilities |

The `role` field is stored on the `User` model (enum: `["user", "admin"]`, default: `"user"`).

---

## Socket.io Events (Server → Client)

| Event | Emitted By | When |
|-------|-----------|------|
| `new_message` | `sendMessage` controller | After saving a message, to the conversation room |
| `conversation_deleted` | `deleteConversation` controller | After deleting a conversation, broadcast to all clients |
| `typing` | `socket.ts` | When another user starts typing (relayed via `socket.to(room)`) |
| `stop-typing` | `socket.ts` | When another user stops typing (relayed via `socket.to(room)`) |

Socket.io is initialized in `src/index.ts` via `initIo(server)`. Controllers
call `getIo()` to emit events. No authentication is enforced on Socket.io
connections (known limitation — see docs/socket.md).

---

## File Structure

```
src/
├── index.ts              # App entry, middleware chain, route mounting, Socket.io init
├── socket.ts             # Socket.io server (initIo, getIo)
├── config/
│   └── env.ts            # Environment variables (PORT, MONGO_URI, JWT_SECRET, etc.)
├── controllers/
│   ├── login.ts          # getLogin, login, logout
│   ├── user.ts           # getUsers, addUser, removeUser
│   ├── inbox.ts          # getInbox, searchUser, addConversation, getMessages, deleteConversation, searchConversation
│   └── sendMessage.ts    # sendMessage
├── middlewares/
│   ├── handleAuth.ts     # checkAuthentication (soft), requireAuth (hard)
│   ├── decorateHtmlResponse.ts  # Template locals (res.locals pattern)
│   ├── errorHandler.ts   # notFoundHandler, errorHandler
│   ├── chat/
│   │   ├── attachmentUpload.ts  # Multer for chat file uploads
│   │   └── conversationAuth.ts  # conversationParticipant authorization middleware
│   ├── login/
│   │   └── loginValidator.ts   # express-validator rules for login
│   └── users/
│       ├── avatarUpload.ts     # Multer for avatar uploads
│       └── userValidator.ts    # express-validator rules for user creation
├── models/
│   ├── user.ts           # User schema (name, email, mobile, password, avatar, role)
│   ├── conversation.ts   # Conversation schema (creator, participant, last_updated)
│   └── message.ts        # Message schema (text, sender, receiver, conversations, attachment)
└── router/
    ├── login.ts          # / routes
    ├── user.ts           # /users routes
    └── inbox.ts          # /inbox routes (+ conversationParticipant middleware)
```
