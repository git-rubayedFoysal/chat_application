# Authorization

This document explains how **authorization** (who may do what) works in the
chat application. It covers:

1. The **role model**
2. The **hard gate** (`requireAuth`)
3. The **conversation gate** (`conversationParticipant`)
4. The **inline ownership check** in `sendMessage`
5. The **controller-level re-checks**
6. The **route protection matrix**
7. **Response semantics** for HTML and JSON clients

Authentication (how `req.user` gets populated) is covered in
`docs/authentication.md`. No diagrams are used — everything is explained in
plain text.

---

## 1. Role Model

**File:** `src/models/user.ts`

- `role` is a string with `enum: ["user", "admin"]` and `default: "user"`.
- New users created via `POST /users` always get the default role; there is no
  UI to change it.
- The role is embedded in the JWT at login, so guards can check it without a
  database lookup (see `docs/authentication.md`).

---

## 2. Hard Gate: `requireAuth(roles)`

**File:** `src/middlewares/handleAuth.ts` — mounted per router in
`src/index.ts`.

| Condition | HTML request (`res.locals.html`) | JSON/API request |
|-----------|-----------------------------------|------------------|
| No `req.user` | Redirect to `/` | `401` with `errors.common.msg` |
| Role not in the allowed list | Error page via `next(createError(403, ...))` | `403` with `errors.common.msg` |
| Allowed | `next()` | `next()` |

Mount points:

```typescript
app.use("/users",  decorateHtmlResponse("Users"),  checkAuthentication, requireAuth(["admin"]),       userRouter);
app.use("/inbox",  decorateHtmlResponse("Inbox"),  checkAuthentication, requireAuth(["admin","user"]), inboxRouter);
```

The login router (`/`) is public; only the soft gate runs there.

---

## 3. Conversation Gate: `conversationParticipant`

**File:** `src/middlewares/chat/conversationAuth.ts` — applied in
`src/router/inbox.ts` to routes that take `:conversationId`:

```typescript
router.get("/messages/:conversationId", conversationParticipant, getMessages);
router.delete("/conversation/:conversationId", conversationParticipant, deleteConversation);
```

How it works:

1. Reads `conversationId` from the URL and `userId` from `req.user`.
2. Runs one query that filters by membership **and** ID:
   ```typescript
   Conversation.findOne({
     _id: conversationId,
     $or: [{ creator: userId }, { participant: userId }],
   }).select("_id creator participant last_updated");
   ```
3. No match → the user is not a participant. HTML gets the error page; JSON
   gets `403`. The response never reveals whether the conversation exists.
4. On success the document is cached on `req.conversation` so downstream
   controllers do not need a second lookup (currently the controllers re-run
   their own check; the cache is available for future use).
5. A malformed ObjectId surfaces as a Mongoose `CastError` and is returned as
   `400 "Invalid conversation ID format."` instead of a server fault.

**Ordering requirement:** must run after `requireAuth`, which guarantees
`req.user` is set. It must also run before the controller so non-participants
are rejected before any message data is read or deleted.

---

## 4. Inline Ownership Check in `sendMessage`

**Route:** `POST /inbox/message` — `attachmentUpload`, then `sendMessage`.

The ownership check lives inline in the controller rather than as middleware
because `attachmentUpload` must parse the multipart body first. The check is
the same membership query as the gate:

```typescript
Conversation.findOne({
  _id: conversationId,
  $or: [{ creator: userId }, { participant: userId }],
});
// no match → throw createError(403, "Access denied")
```

---

## 5. Controller-Level Re-checks

`getMessages` and `deleteConversation` each repeat the membership query
themselves (`$or: [{ creator: userId }, { participant: userId }]`) and throw
`403 "Access denied"` when nothing matches. This is defense in depth: the
middleware is the first line, and the controller does not trust a conversation
ID it has not verified itself.

`searchConversation` scopes its query to the user's own conversations
(`$or: [{ creator: userId }, { participant: userId }]`) and then filters to
the **other** participant, so a user can never search into someone else's
chats.

---

## 6. Route Protection Matrix

| Method | Path | Gate(s) | Notes |
|--------|------|---------|-------|
| `GET` | `/` | none (soft gate only) | Public login page |
| `POST` | `/` | none (soft gate only) | Public; validated by `loginValidator` |
| `DELETE` | `/` | none (soft gate only) | Public logout |
| `GET` | `/users/` | `requireAuth(["admin"])` | Admin only |
| `POST` | `/users/` | `requireAuth(["admin"])` | Admin only |
| `DELETE` | `/users/:id` | `requireAuth(["admin"])` | Admin only |
| `GET` | `/inbox/` | `requireAuth(["admin","user"])` | Inbox page |
| `POST` | `/inbox/search` | `requireAuth` | User search |
| `POST` | `/inbox/conversation` | `requireAuth` | Create/find conversation |
| `GET` | `/inbox/messages/:conversationId` | `requireAuth` + `conversationParticipant` | Load messages |
| `POST` | `/inbox/message` | `requireAuth` + inline check | Send message |
| `DELETE` | `/inbox/conversation/:conversationId` | `requireAuth` + `conversationParticipant` | Delete conversation |
| `POST` | `/inbox/search-conversation` | `requireAuth` | Scoped to own conversations |

---

## 7. Response Semantics

The branch flag is `res.locals.html`, set by `decorateHtmlResponse` on every
HTML mount. The same failure produces different responses per client type:

| Failure | HTML client | JSON client |
|---------|-------------|-------------|
| Not signed in | Redirect to `/` | `401` + `errors.common.msg` |
| Wrong role | Error page (`403`) | `403` + `errors.common.msg` |
| Not a conversation participant | Error page (`403`) | `403` + `errors.common.msg` |
| Malformed conversation ID | — | `400 "Invalid conversation ID format."` |

Error bodies use the shared shape:

```json
{ "errors": { "common": { "msg": "..." } } }
```

---

## 8. Known Limitations

- **Socket.io is not authorized** — any connected client can join any room by
  sending a `join_conversation` event (see `docs/socket.md`).
- **Role changes require re-login** because the role is read from the JWT, not
  the database.
- **No per-resource scopes** beyond conversation membership (for example,
  there is no per-message ownership check because messages are only reachable
  through a conversation the user belongs to).

---

## See Also

- `docs/authentication.md` — how `req.user` is populated.
- `docs/routes.md` — the full route map with middleware chains.
- `docs/inbox.md`, `docs/login.md`, `docs/users.md` — module-level details.
