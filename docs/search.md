# Search

This document explains how **search** works in the chat application. There are
two searches, both living in `src/controllers/inbox.ts`:

1. **User search** — `POST /inbox/search` (`searchUser`)
2. **Conversation search** — `POST /inbox/search-conversation`
   (`searchConversation`)

No diagrams are used — everything is explained in plain text.

---

## 1. Input Normalization

Both searches strip the Bangladesh country code before matching:

```typescript
const cleanQuery = query.replace("+88", "");
```

**Why:** users type numbers with or without the `+88` prefix, and the database
may store either form. Normalizing the query makes both work.

---

## 2. Regex Construction

Each search builds three patterns from the cleaned query, passing the text
through `escapeRegex` (`src/utils/escapeRegExp.ts`) first:

```typescript
const nameRegex = new RegExp(escapeRegex(cleanQuery), "i");      // contains
const mobileRegex = new RegExp(`^${escapeRegex(cleanQuery)}`);   // starts with
const emailRegex = new RegExp(`^${escapeRegex(cleanQuery)}$`, "i"); // exact
```

**Why `escapeRegex` is required:** the query is user input. Without escaping,
characters like `.` or `*` would be interpreted as regex operators, which both
breaks matching and opens a ReDoS-style abuse vector. The helper replaces
every regex metacharacter with its literal escape.

---

## 3. User Search (`searchUser`)

Used by the "Create New Conversation" modal
(`views/partials/add-conversation-modal.ejs`).

1. Input arrives as `req.body.user`.
2. The query is normalized (section 1).
3. An empty query throws `400 "Search query cannot be empty."`.
4. One query runs against `User` with `$or: [name, mobile, email]`, selecting
   only `name email mobile avatar`.
5. The matching users are returned as a plain JSON array.

Client behavior: the modal sends the request 500 ms after the user stops
typing (keyup debounce), renders each result as a clickable row that calls
`createConversation(user._id)`, and shows `result.errors.common.msg` in the
modal's error element on failure.

---

## 4. Conversation Search (`searchConversation`)

Used by the inbox sidebar search box (`views/inbox.ejs`).

1. Input arrives as `req.body.query`.
2. The query is normalized; an empty query throws `400`.
3. The server loads **all** conversations where the user is `creator` or
   `participant`, populating both sides with `name avatar email mobile`.
4. Each conversation is filtered in JavaScript against the **other**
   participant (never the logged-in user):

   ```typescript
   const creatorId = conversation.creator?._id?.toString();
   const otherUser = creatorId === userId ? conversation.participant : conversation.creator;
   ```

   **Why the other participant:** the user's own name/email/mobile would match
   every conversation in their sidebar, which identifies nothing.

5. The result is returned as `{ data: filteredConversations }`.

Client behavior: the sidebar sends the request 500 ms after typing stops,
renders matched conversations into `.search_conversations`, and clicking a row
opens that conversation.

---

## 5. Error Shapes

- `searchUser` catches its own errors and always answers with the JSON shape
  `{ errors: { common: { msg } } }`. Note that its catch block hard-codes
  `res.status(500)`, so the intentional `400` for an empty query is reported
  as a 500 unless headers were already sent.
- `searchConversation` preserves the thrown status (`(error as { status?:
  number })?.status ?? 500`), so an empty query correctly returns 400.

---

## 6. Known Limitations

- **Mobile prefix mismatch:** the pattern anchors to the start of the stored
  number. If the database keeps `+88` while the query does not (or the
  reverse), the match fails. Normalizing the stored format would fix it.
- **No pagination:** both searches return every match.
- **In-memory filtering:** conversation search loads the user's whole
  conversation list and filters in JavaScript. Fine at current scale; it
  should move into the query at larger volumes.
- **Email must match exactly** (case-insensitive); partial emails do not
  match.

---

## See Also

- `docs/inbox.md` — the inbox feature that hosts both searches.
- `docs/routes.md` — route and middleware map.
- `docs/data-model.md` — the schemas being queried.
