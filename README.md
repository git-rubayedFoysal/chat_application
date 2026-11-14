# Chat Application

A real-time, 1-on-1 chat application built with Node.js, TypeScript, Express,
MongoDB (Mongoose), EJS templates, and Socket.io. Users sign in with email or
mobile number, search for other users, create conversations, exchange messages
with file attachments, and see typing indicators live.

## Features

- **Secure sign-in** — argon2 password hashing, JWT stored in a signed,
  HTTP-only cookie; soft gate populates `req.user`, hard gate enforces roles.
- **1-on-1 conversations** — duplicate pairs (A→B and B→A) are detected and
  reuse the existing conversation.
- **Real-time messaging** — Socket.io rooms named after the conversation ID;
  clients only receive events for the chat currently on screen.
- **Typing indicators** — debounced `typing` / `stop-typing` events relayed to
  the room, with a 3-second auto-hide safety timer.
- **File attachments** — images plus PDF/DOC/XLS/TXT up to 20 MB per message;
  avatar uploads (JPG/JPEG/PNG) up to 5 MB.
- **Search** — user search by name / mobile / email and conversation search
  scoped to the logged-in user's own conversations; input is regex-escaped and
  the `+88` country prefix is normalized.
- **Admin user management** — admin-only `/users` routes to create and delete
  users; failed registrations clean up already-written avatar files.
- **Inbox ordering** — conversations sorted by `last_updated`, bumped on every
  message; deleting a conversation removes it for everyone in real time.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime / language | Node.js, TypeScript (strict, ES2022, NodeNext) |
| Server | Express 5 |
| Database | MongoDB via Mongoose |
| Templates | EJS |
| Real-time | Socket.io |
| Auth | JSON Web Tokens, argon2, signed cookies |
| Uploads | Multer (disk storage) |
| Validation | express-validator |
| Client | Vanilla JS, moment.js, Toastify |

## Requirements

- Node.js (v20 or newer recommended)
- MongoDB (local or Atlas connection string)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the environment

Create a `.env` file in the project root by copying `.env.example`, then
replace the placeholder values. The app validates every variable at startup
and exits immediately if anything is missing or malformed.

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port, integer 1–65535 |
| `Mongo_URI` | MongoDB connection string |
| `NODE_ENV` | `development`, `production`, or `test` |
| `JWT_SECRET` | Secret used to sign JWTs |
| `JWT_EXPIRATION` | Token lifetime (e.g. `7d`) |
| `COOKIE_NAME` | Name of the auth cookie |
| `COOKIE_MAX_AGE` | Cookie lifetime in milliseconds (positive integer) |
| `COOKIE_SECRET` | Secret used to verify signed cookies |

### 3. Bootstrap the first admin

There is no seeder and no UI to change roles, and `/users` is admin-only.
Insert the first user directly into MongoDB with `role: "admin"` and an
argon2-hashed password (or promote an existing user's `role` field).

### 4. Run the app

```bash
npm run dev        # development server with tsx watch (NODE_ENV=development)
npm run build      # compile TypeScript to dist/
npm start          # run the compiled output (dist/index.js)
npm run typecheck  # type-check only (tsc --noEmit)
```

The app listens on `PORT` and serves templates, static files, and the Socket.io
endpoint from the same server.

## Project Structure

```
src/
├── index.ts                 # App entry: middleware chain, route mounts, socket init
├── socket.ts                # Socket.io factory (initIo / getIo) + event handlers
├── dbConnection.ts          # MongoDB connection
├── config/
│   └── env.ts               # Startup-validated environment variables
├── controllers/
│   ├── login.ts             # getLogin, login, logout
│   ├── inbox.ts             # getInbox, searchUser, addConversation, getMessages,
│   │                        #   deleteConversation, searchConversation
│   ├── sendMessage.ts       # sendMessage (with socket emit)
│   └── user.ts              # getUsers, addUser, removeUser
├── middlewares/
│   ├── handleAuth.ts        # checkAuthentication (soft), requireAuth (hard)
│   ├── decorateHtmlResponse.ts
│   ├── errorHandler.ts      # notFoundHandler, errorHandler
│   ├── login/
│   │   └── loginValidator.ts
│   ├── users/
│   │   ├── avatarUpload.ts
│   │   └── userValidator.ts # rules + handler (deletes rejected avatar files)
│   └── chat/
│       ├── attachmentUpload.ts
│       └── conversationAuth.ts  # conversationParticipant gate
├── models/
│   ├── user.ts              # name, email, mobile, password, avatar, role
│   ├── conversation.ts      # creator, participant, last_updated
│   └── message.ts           # text, sender, receiver, conversations, attachment[]
├── router/
│   ├── login.ts             # GET /, POST /, DELETE /
│   ├── inbox.ts             # /inbox/* routes
│   └── user.ts              # /users/* routes (admin only)
├── types/
│   └── express/             # req.user typing
└── utils/
    ├── escapeRegExp.ts      # regex metacharacter escaping for search
    └── singleFileUploader.ts # shared Multer disk-storage factory
public/
├── uploads/
│   ├── avatars/             # user avatars (runtime data, git-ignored)
│   └── attachments/         # chat attachments (runtime data, git-ignored)
├── js/                      # moment.js, toastify.js (vendored)
└── stylesheets/
    ├── style.css            # app styles
    └── toastify.css         # vendored
views/
├── index.ejs                # login page
├── inbox.ejs                # main chat interface
├── users.ejs                # admin user management
├── error.ejs                # error page
└── partials/                # header, footer, modals
docs/                        # architecture, module, and flow documentation
```

## Documentation

Module and subsystem docs live in `docs/`:

| File | Covers |
|------|--------|
| `docs/routes.md` | Full route map, middleware chains, roles, socket events |
| `docs/authentication.md` | Login flow, JWT cookie, soft gate, logout |
| `docs/authorization.md` | Role model, hard gate, conversation gate, route matrix |
| `docs/data-model.md` | Schemas and the reasoning behind each decision |
| `docs/socket.md` | Socket.io setup, rooms, event map, flows |
| `docs/search.md` | User and conversation search internals |
| `docs/uploads.md` | Multer factory, storage, validation, cleanup |
| `docs/inbox.md` | Inbox module deep dive |
| `docs/login.md` | Login module deep dive |
| `docs/users.md` | User management module deep dive |
| `docs/*-router-flow.md` | Mermaid flow diagrams per router |

## Known Limitations

- 1-on-1 conversations only (no group chat)
- No message edit or delete; no read receipts
- No Socket.io authentication — room joins trust the client-supplied
  conversation ID
- No password reset, email/mobile verification, rate limiting, or "remember
  me"; logout does not revoke the JWT server-side
- Role changes require re-login (the role is read from the JWT)
- Uploaded files are local-disk only; attachments are not cleaned up when a
  message or conversation is deleted

## Author

Rubayed Ahmed Foysal — licensed under ISC (see `package.json`).
