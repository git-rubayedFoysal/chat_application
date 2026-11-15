# Data Model Decisions

This document explains the **Mongoose data model** of the chat application and
the reasoning behind each schema decision. It covers:

1. The **User** schema
2. The **Conversation** schema
3. The **Message** schema
4. A **decision summary** (what was chosen and why)
5. **Performance notes**
6. **Known limitations**

No diagrams are used — everything is explained in plain text.

---

## 1. User Schema

**File:** `src/models/user.ts` — model registered as `"user"` (singular).

| Field | Type | Notes |
|-------|------|-------|
| `name` | String | Required, trimmed |
| `email` | String | Required, trimmed, lowercased |
| `mobile` | String | Required |
| `password` | String | Required; stored as an argon2 hash, never plaintext |
| `public_id` | String | Optional Cloudinary identifier for the avatar |
| `url` | String | Optional Cloudinary `secure_url` for the avatar |
| `role` | String | `enum: ["user", "admin"]`, `default: "user"` |

All schemas use `timestamps: true` (`createdAt` / `updatedAt`).

**Why singular model name:** the conversation and message schemas reference it
as `ref: "user"`, so the registered name must match.

**Why `email` is lowercased:** it keeps lookups case-insensitive by
construction, which matters because login and user search match on email.

---

## 2. Conversation Schema

**File:** `src/models/conversation.ts`

| Field | Type | Notes |
|-------|------|-------|
| `creator` | ObjectId ref `"user"` | Required; the user who created the chat |
| `participant` | ObjectId ref `"user"` | Required; the other user |
| `last_updated` | Date | `default: Date.now`; bumped on every message |

**Why two fields instead of a participants array:** the application is
1-on-1 only. Two fields make the ownership check a simple `$or` query
(`creator` or `participant` equals the user) with no array scanning. Group
chat would require replacing both fields with a participants array and
rethinking authorization.

**Why a reversed pair counts as the same conversation:** `addConversation`
checks both directions (`creator: A, participant: B` and `creator: B,
participant: A`) before creating, so a pair cannot end up with two chats.

**Why `last_updated` instead of querying messages:** the inbox list is sorted
by recency. Storing the timestamp on the conversation avoids an aggregation or
join against the messages collection on every inbox render. `sendMessage`
bumps it with `$set: { last_updated: new Date() }`.

---

## 3. Message Schema

**File:** `src/models/message.ts`

| Field | Type | Notes |
|-------|------|-------|
| `text` | String | Required |
| `sender` | ObjectId ref `"user"` | Required |
| `receiver` | ObjectId ref `"user"` | Required |
| `date_time` | Date | `default: Date.now`; the display timestamp |
| `conversations` | ObjectId ref `"conversation"` | Required; denormalized |
| `attachment` | `[{ public_id, url, resource_type }]` | Cloudinary identifiers/URLs for each file |

**Why `conversations` is stored on the message:** messages are listed and
bulk-deleted by conversation. A direct reference means `Message.find({
conversations: id })` and `Message.deleteMany({ conversations: id })` work
without joining through the conversation's participants.

**Why both `date_time` and `timestamps`:** `date_time` is the business display
time used by the templates (`moment(message.date_time).fromNow()`); the
auto `createdAt` is used for sort order (`getMessages` sorts
`createdAt: -1`).

**Why attachments store Cloudinary references:** each file is uploaded to
Cloudinary from a memory buffer and the message keeps
`{ public_id, url, resource_type }` per file. The `public_id` is needed to
destroy the asset later, `url` is the display URL used by the templates, and
`resource_type` records which pipeline (`image` or `raw`) the asset lives in so
`destroy()` targets the right one.

---

## 4. Decision Summary

| Decision | Chosen | Reason |
|----------|--------|--------|
| Conversation shape | `creator` + `participant` fields | Simple `$or` ownership check; app is 1-on-1 only |
| Duplicate pair prevention | App-level bidirectional lookup | No unique index exists on the pair |
| Inbox ordering | `conversation.last_updated` | Avoids per-render join/aggregation on messages |
| Message → conversation link | Denormalized `conversations` ref | Direct list/delete by conversation |
| Role storage | Enum on User, copied into JWT | Guards authorize without a DB lookup |
| Model name | Singular `"user"` | Matches `ref` values in other schemas |
| Password storage | argon2 hash | Never store plaintext |

---

## 5. Performance Notes

- No custom indexes are defined beyond Mongoose defaults (`_id`).
- The hot queries filter on `creator` / `participant` (conversations) and
  `conversations` (messages). At current scale this is fine; at large scale
  these would need indexes, and the inbox query would benefit from a compound
  index on `{ creator: 1, last_updated: -1 }` / `{ participant: 1,
  last_updated: -1 }`.
- `getUsers` uses `.lean()` because the rows are read-only (rendered in a
  table); skipping document hydration is faster.

---

## 6. Known Limitations

- **No unique constraint on a conversation pair** — duplicates are prevented
  only by the application-level bidirectional check.
- **No message edit/delete** — once saved, a message is immutable.
- **No read receipts** — nothing tracks whether a message was seen.
- **No group chat** — the schema cannot express more than two participants.
- **Attachments are cleaned up only on conversation deletion** — deleting a
  conversation destroys its messages' Cloudinary assets, but individual messages
  cannot be deleted.
- **Avatar and attachment assets depend on Cloudinary** — `public_id` values are
  stored so assets can be destroyed, but a failed destroy leaves an orphaned
  asset in Cloudinary.

---

## See Also

- `docs/authorization.md` — how these schemas are enforced per request.
- `docs/routes.md` — which routes read and write each model.
- `docs/uploads.md` — how avatar and attachment uploads use Cloudinary.
