# Socket.io

This document explains the **real-time layer** of the chat application. It
covers:

1. The **server setup** (`src/socket.ts`)
2. **Rooms** and the join/leave rule
3. The **event map** (client ↔ server)
4. The **new message** flow
5. The **conversation deleted** broadcast
6. The **typing indicator** flow
7. **Client-side behavior** (`views/inbox.ejs`)
8. **Known limitations**

No diagrams are used — everything is explained in plain text.

---

## 1. Server Setup

**File:** `src/socket.ts`

The module exposes two functions instead of a shared instance created at
import time:

- `initIo(server)` — creates the `Server`, attaches the connection handlers,
  and stores the instance in a module-level variable. It returns nothing.
- `getIo()` — returns the stored instance, or throws
  `"Socket.io has not been initialized. Call initIo first."`.

**Why a factory:** `index.ts` must create the HTTP server first
(`createServer(app)`), then call `initIo(server)` (`src/index.ts:22`). If the
Socket.io instance were created at module load, controllers importing it would
drag in the app bootstrap and create a circular dependency.

CORS is open (`origin: "*"`, methods GET/POST) because the client and server
are served from the same origin in this project; tighten this before any
cross-origin deployment.

---

## 2. Rooms

A room is named after the **conversation ID**. Every event is scoped to a room
with `socket.to(conversationId)`, so only participants viewing that chat
receive it.

On `join_conversation` the server first leaves every room except the socket's
own ID, then joins the requested room. **Why:** a browser tab that previously
opened another chat would otherwise keep receiving events from that stale
room.

---

## 3. Event Map

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `join_conversation` | Client → Server | `conversationId` | Join (and only keep) that room |
| `typing` | Client → Server | `{ conversationId, isTyping, senderId, senderName }` | User started typing |
| `stop-typing` | Client → Server | same as `typing` | User stopped typing |
| `typing` | Server → Client | `{ conversationId, userId, userName }` | Relayed to the room's other members |
| `stop-typing` | Server → Client | same as `typing` | Relayed stop signal |
| `new_message` | Server → Client | `{ message, conversationId }` | Saved message, populated |
| `conversation_deleted` | Server → Client (all) | `{ conversationId }` | Chat removed anywhere |

Server relay handlers map the client payload onto the smaller relay payload
(`senderId` → `userId`, `senderName` → `userName`) and drop anything without a
`conversationId`.

---

## 4. New Message Flow

1. `POST /inbox/message` saves the message (`sendMessage` controller).
2. The conversation's `last_updated` is bumped so it rises to the top of the
   inbox list.
3. The message is re-fetched with `sender` and `receiver` populated
   (`name`, `url`).
4. The server emits to the room:
   ```typescript
   io.to(conversationId).emit("new_message", {
     message: populatedMessage,
     conversationId,
   });
   ```
5. The controller returns `201` with the populated message.

The sender receives the event too (they are in the room); the client renders
it by `sender._id === loginUserId` and skips its own avatar.

---

## 5. Conversation Deleted Broadcast

`deleteConversation` deletes the conversation and its messages, then emits
**globally**:

```typescript
getIo().emit("conversation_deleted", { conversationId });
```

**Why a broadcast instead of a room emit:** the other participant may have the
chat closed or be viewing another conversation, so they are not in the room.
A global broadcast guarantees every client drops the sidebar entry; the client
listener is idempotent, so a client that already removed the row locally (from
its own DELETE response) is unaffected.

---

## 6. Typing Indicator Flow

1. The client emits `typing` once when input starts (`isTyping: true`).
2. A 1.5 s debounce emits `stop-typing` (`isTyping: false`).
3. The server relays both to the room with `socket.to(conversationId)`, so the
   sender never sees their own indicator.
4. The receiving client shows "`userName` is typing..." in
   `#conversation-partner` (italic, smaller) and starts a 3 s auto-hide timer
   in case the other user closes the tab without sending `stop-typing`.
5. On `stop-typing`, the timer is cleared and the partner name is restored.

The client also stops typing when switching conversations, sending a message,
or having a conversation deleted, so timers never fire against a room the user
has left.

---

## 7. Client-Side Behavior

**File:** `views/inbox.ejs`

```javascript
const socket = io(localHost); // localHost = window.location.host

socket.on("connect", () => {
  // Rejoin the open conversation after a reconnect, otherwise live
  // messages and typing stop working silently.
  if (current_conversation_id) {
    socket.emit("join_conversation", current_conversation_id);
  }
});
```

- `connect_error` and `disconnect` are logged to the console only.
- `new_message` is ignored unless `conversationId == current_conversation_id`.
- Messages are inserted at the top of `#chat-message-list`.

---

## 8. Known Limitations

- **No Socket.io authentication:** the handshake carries no token, and
  `join_conversation` trusts whatever `conversationId` the client sends. Any
  connected client can join any room. Room join should be authorized server-
  side before production use.
- **No message queueing:** messages sent while a client is disconnected are
  not replayed on reconnect (the client re-reads history via
  `GET /inbox/messages/:conversationId`).
- **No reconnection backoff:** Socket.io's built-in reconnection is used;
  there is no custom strategy or queued-event handling.

---

## See Also

- `docs/inbox.md` — the inbox feature that uses these events.
- `docs/routes.md` — HTTP routes that trigger the emits.
- `docs/authorization.md` — why HTTP routes are protected but sockets are not.
