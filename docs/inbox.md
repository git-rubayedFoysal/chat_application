# Inbox Module

This document explains how the **inbox feature** works in the chat application. It covers:

1. The **routes** (how the browser talks to the server)
2. The **template** (`views/inbox.ejs`) (what the user sees)
3. The **data flow** (step-by-step what happens when you use the inbox)
4. **Socket.io real-time messaging**
5. **Recent fixes and improvements**

No diagrams are used — everything is explained in plain text.

---

## 1. Routes Overview

All inbox routes are mounted under `/inbox` in `src/index.ts` and defined in `src/router/inbox.ts`.

Authentication is handled by `checkAuthentication` (soft gate) and
`requireAuth(["admin", "user"])` (hard gate) in `src/index.ts`.
Conversation-level authorization is handled by the
`conversationParticipant` middleware
(`src/middlewares/chat/conversationAuth.ts`) on routes that accept
`:conversationId`. See `docs/authorization.md` for full details.

| Method | Path | Controller | Auth Required | Role | Conversation-Level Auth | What It Does |
|--------|------|------------|---------------|------|-------------------------|--------------|
| `GET` | `/inbox/` | `getInbox` | Yes | admin, user | No | Show the inbox page with all conversations |
| `POST` | `/inbox/search` | `searchUser` | Yes | admin, user | No | Search for users to start a new conversation |
| `POST` | `/inbox/conversation` | `addConversation` | Yes | admin, user | No | Create a new conversation (with validation) |
| `GET` | `/inbox/messages/:conversationId` | `getMessages` | Yes | admin, user | Yes (`conversationParticipant`) | Load messages inside a conversation |
| `POST` | `/inbox/message` | `sendMessage` | Yes | admin, user | Yes (inline check in controller) | Send a new message with optional attachments |
| `DELETE` | `/inbox/conversation/:conversationId` | `deleteConversation` | Yes | admin, user | Yes (`conversationParticipant`) | Delete a conversation and all its messages |
| `POST` | `/inbox/search-conversation` | `searchConversation` | Yes | admin, user | No | Search within the user's existing conversations |

Query param:
| Param | Purpose |
|-------|---------|
| `?open=<conversationId>` | Auto-opens the given conversation when the inbox page loads (used after creating/finding a conversation) |

---

## 2. Route Details

### 2.1 `GET /inbox/` — Show the Inbox Page

**Controller:** `getInbox` in `src/controllers/inbox.ts`

**What happens step-by-step:**

1. The server looks for all conversations where the logged-in user is either the **creator** or the **participant**.
2. It fetches the `name` and `url` of both users in each conversation.
3. It saves the conversation list into `res.locals.data` so the template can use it.
4. It also saves the `moment` library into `res.locals.moment` so dates can be shown in relative format (like "2 hours ago").
5. It renders the `inbox.ejs` template.

**Example data sent to template:**
```json
data = [
  {
    "_id": "conv123",
    "creator": { "_id": "userA", "name": "Alice", "url": "https://res.cloudinary.com/.../alice.jpg" },
    "participant": { "_id": "userB", "name": "Bob", "url": "https://res.cloudinary.com/.../bob.jpg" },
    "last_updated": "2026-11-12T10:00:00Z"
  }
]
```

---

### 2.2 `POST /inbox/search` — Search Users

**Controller:** `searchUser` in `src/controllers/inbox.ts`

**What happens step-by-step:**

1. The frontend sends a search query (for example: "john" or "+8801712345678").
2. The server removes the `+88` prefix if present (to normalize phone numbers).
3. It creates three search patterns:
   - **Name:** matches any user whose name contains the query (case-insensitive).
   - **Mobile:** matches any user whose phone number starts with the query.
   - **Email:** matches any user whose email exactly equals the query.
4. It returns a list of matching users with their `name`, `email`, `mobile`, and `url`.

**Frontend use:** The "Create New Conversation" modal calls this every time the user types in the search box.

**Note:** The mobile pattern is anchored to the start of the stored number
after stripping `+88` from the query. If the stored number keeps the `+88`
prefix while the query does not (or the reverse), the match fails. Normalizing
the stored format would avoid this.

---

### 2.3 `POST /inbox/conversation` — Create Conversation

**Controller:** `addConversation` in `src/controllers/inbox.ts`

**What happens step-by-step:**

1. The frontend sends the participant's user ID.
2. **Validation checks:**
   - Participant ID is required
   - Cannot create conversation with yourself (`participantId !== userId`)
   - Conversation doesn't already exist between these two users (checks both directions: A-B or B-A)
3. If a conversation already exists between these two users, the server returns **200** with:
   ```json
   {
     "message": "Conversation already exists.",
     "existing": true,
     "conversationId": "<existing conversation ID>"
   }
   ```
   The frontend redirects to `/inbox?open=<conversationId>` so the existing chat opens immediately instead of showing an error.

4. If it's a new conversation, the server creates the document and returns **201**:
   ```json
   {
     "message": "Conversation created successfully.",
     "existing": false,
     "conversationId": "<new conversation ID>"
   }
   ```

5. The frontend redirects to `/inbox?open=<conversationId>`. The inbox page reads the `open` param, finds the matching sidebar item by `data-conversation-id`, and calls `getMessages()` to load the chat automatically. A page reload happens first so newly created conversations appear in the list.

---

### 2.4 `GET /inbox/messages/:conversationId` — Load Messages

**Controller:** `getMessages` in `src/controllers/inbox.ts`

**What happens step-by-step:**

1. The frontend sends a `conversationId` in the URL.
2. The `conversationParticipant` middleware checks that the logged-in user is
   part of this conversation; the controller repeats the check itself before
   reading any messages.
3. It fetches both the `creator` and `participant` details (populated with `name` and `url`).
4. It figures out who the "other user" is (the person who is NOT the logged-in user).
5. It fetches all messages belonging to this conversation, sorted by time (newest first), with sender populated.
6. It returns the messages and the other user's details.

**Example response:**
```json
{
  "data": {
    "messages": [
      {
        "sender": { "_id": "userA", "name": "Alice", "url": "https://res.cloudinary.com/.../alice.jpg" },
        "text": "Hello!",
        "date_time": "2026-11-12T10:05:00Z",
        "attachment": [
          {
            "public_id": "chat_application/messages/conv123/file",
            "url": "https://res.cloudinary.com/.../file.pdf",
            "resource_type": "image"
          }
        ]
      }
    ],
    "participant": { "_id": "userB", "name": "Bob", "url": "https://res.cloudinary.com/.../bob.jpg" }
  },
  "user": "userA",
  "conversationId": "conv123"
}
```

---

### 2.5 `POST /inbox/message` — Send Message

**Controller:** `sendMessage` in `src/controllers/sendMessage.ts`

**What happens step-by-step:**

1. The frontend sends:
   - `message`: the text typed by the user
   - `receiverId`: the other user's ID
   - `conversationId`: which conversation this belongs to
   - `attachment`: any files attached (optional)
2. The server validates that the message text is not empty.
3. It checks that the logged-in user is part of this conversation.
4. It uploads each attachment to Cloudinary (from memory) and saves the message with sender, receiver, conversation, text, and the array of `{ public_id, url, resource_type }` attachment objects.
5. It updates the conversation's `last_updated` timestamp so it moves to the top of the list.
6. **It populates the message's sender and receiver** with `name` and `url`.
7. **It emits a Socket.io event** to all clients in the conversation room:
   ```typescript
   io.to(conversationId).emit("new_message", {
     message: populatedMessage,
     conversationId,
   });
   ```
8. It returns the created message.

---

### 2.6 `DELETE /inbox/conversation/:conversationId` — Delete Conversation

**Controller:** `deleteConversation` in `src/controllers/inbox.ts`

**What happens step-by-step:**

1. The frontend sends a `conversationId` in the URL with a DELETE request.
2. The server checks if the logged-in user is actually part of this conversation (security check).
3. If authorized, the server collects each message's attachments and destroys their Cloudinary assets (`cloudinary.uploader.destroy(public_id)`).
4. The conversation document is deleted from MongoDB.
5. All messages belonging to this conversation are also deleted (`deleteMany` by conversationId).
5. **The server broadcasts `conversation_deleted` to all connected clients** via Socket.io so the other participant's sidebar updates in real time.
6. It returns a success message.

**Example response:**
```json
{
  "message": "Conversation deleted successfully."
}
```

---

## 3. Template: `views/inbox.ejs`

The template is an EJS file, which means it mixes HTML with server-side JavaScript tags (`<% %>` for logic, `<%= %>` for output).

### 3.1 Includes (Shared Parts)

At the top and bottom, the template includes shared partial files:

| Include | File | Purpose |
|---------|------|---------|
| Header | `./partials/header.ejs` | HTML `<head>`, navigation menu, logout button |
| Modal | `./partials/add-conversation-modal.ejs` | Popup to create a new conversation |
| Footer | `./partials/footer.ejs` | Closing `</body>` and `</html>` tags |

---

### 3.2 Conversation List

This section shows all the user's conversations.

**Code logic:**
```ejs
<% data.forEach(function(conversation) { %>
  <% if(conversation.creator._id == loginUser.id) { %>
    <!-- Show the PARTICIPANT's name and avatar -->
  <% } else { %>
    <!-- Show the CREATOR's name and avatar -->
  <% } %>
<% }); %>
```

- `data` comes from the controller (`res.locals.data`) and is always the
  conversation array returned by `getInbox`.

**How it decides who to show:**

Each conversation has two users: `creator` and `participant`. The template checks:

- If `conversation.creator.id` equals the logged-in user's ID → the current user started this chat, so show the **participant** (the other person).
- Otherwise → the current user is the participant, so show the **creator** (the other person).

Each conversation block shows:
1. `data-conversation-id` attribute (used by delete function)
2. Avatar image (or `nophoto.png` if none)
3. Name (`title-text`)
4. Time since the conversation's `last_updated` (`moment(...).fromNow()`, like "3 hours ago")

Clicking a conversation calls the JavaScript function `getMessages(conversation_id, partner_name)`.

**Empty state:** If there are zero conversations, it shows an image saying "no conversation".

---

### 3.3 New Conversation Button

```ejs
<div class="new-message-container" onclick="openModal()">
  <a href="#">+</a>
</div>
```

Clicking the `+` button opens the "Create New Conversation" modal (loaded from `add-conversation-modal.ejs`).

---

### 3.4 Chat Title Area

```ejs
<div id="chat-title">
  <span id="conversation-partner"></span>
  <img src="./images/trash.png" onclick="deleteConversation()" alt="Delete Conversation" />
</div>
```

- `#conversation-partner` starts empty. JavaScript fills it with the other person's name when a conversation is selected.
- The trash icon triggers `deleteConversation()` JavaScript function when clicked.

---

### 3.5 Message Display Area

```ejs
<div id="chat-message-list">
  <div class="nothing">select a conversation</div>
</div>
```

- Initially shows "select a conversation".
- When you click a conversation, JavaScript replaces this area with the actual message bubbles.

---

### 3.6 Message Send Form

```ejs
<form id="chat-form" method="post" enctype="multipart/form-data">
  <label for="attachment"><img src="./images/attachment.png" alt="Add Attachment" /></label>
  <input type="file" multiple name="attachment" class="hide" id="attachment" />
  <input type="text" name="message" placeholder="Type a message" autocomplete="off" />
</form>
```

- Starts hidden (`visibility: hidden` in CSS).
- JavaScript makes it visible after messages load.
- Supports typing a message and attaching multiple files.
- Files are uploaded via `multipart/form-data`.

---

## 4. JavaScript Functions in the Template

The template contains inline `<script>` tags with main functions.

### 4.1 `getMessages(conversation_id, conversation_name)`

**What it does:** Loads messages when you click a conversation.

**Step-by-step:**

1. Creates a failure toast that is only shown if the request fails.
2. Calls `GET /inbox/messages/:conversation_id` via `fetch`.
3. If successful:
   - **Stops typing in the previous room** (if switching conversations) so the partner's indicator clears.
   - Makes the send form visible (`form.style.visibility = 'visible'`).
   - Saves the `participant` (other user) and `conversation_id` into variables.
   - **Joins the Socket.io room**: `socket.emit("join_conversation", conversationId)`
   - Loops through all messages and builds HTML for each one:
     - Shows sender avatar (unless it is the logged-in user).
     - Shows message text.
     - Renders attachments from their Cloudinary `url` (images inline, documents as links).
     - Shows time using `moment().fromNow()`.
   - Inserts all message HTML into `#chat-message-list`.
   - Sets `#conversation-partner` text to the other person's name.
4. If failed, shows an error toast.

---

### 4.2 `socket.on("new_message")` — Real-time Message Handler

**What it does:** Receives live messages from other users via Socket.io.

**Step-by-step:**

1. Listens for `new_message` events from the server.
2. Checks if the message belongs to the currently open conversation (`conversationId == current_conversation_id`).
3. Determines message class: `you-message` (sent by me) or `other-message` (from other user).
4. Builds message HTML with:
   - Sender avatar (hidden for own messages)
   - Message text (`message.text`)
   - Attachments rendered from their Cloudinary `url` (images inline, documents as links)
   - Relative timestamp using `moment(message.date_time).fromNow()`
5. Inserts message at the top of `#chat-message-list` (handles empty list case).

---

### 4.3 `form.onsubmit`

**What it does:** Sends a new message when you submit the form.

**Step-by-step:**

1. Prevents the page from reloading.
2. **Validates:**
   - Message text is not empty
   - `participant` exists and has an `id`
   - `current_conversation_id` is set
3. Collects form data (message text, files) into `FormData`.
4. Adds extra fields: `receiverId`, `receiverName`, `avatar`, `conversationId` (the `avatar` field is legacy and no longer read by the server).
5. Sends everything via `POST /inbox/message`.
6. If successful:
   - Clears the form (`form.reset()`).
   - **Emits `stop-typing`** to the Socket.io server so the partner's typing indicator clears immediately.
7. If failed:
   - Shows an error toast with the server's error message.

---

### 4.4 Typing Indicator

**What it does:** Shows when the other person is typing in the current conversation.

**Step-by-step (client-side listener):**

1. `chatInput.addEventListener("input", …)` — when the logged-in user types:
   - Emits `typing` to the server with `{ conversationId, isTyping: true, senderId, senderName }`.
   - A debounce timer (1.5s) fires `stop-typing` with `isTyping: false` after typing stops.
2. `socket.on("typing", …)` — when another user types:
   - Only reacts if the event's `conversationId` matches the open conversation.
   - Sets `#conversation-partner` to "`userName` is typing..." (italicized).
   - Starts a 3s auto-hide timer in case the other user closes their tab without sending `stop-typing`.
3. `socket.on("stop-typing", …)` — when another user stops typing:
   - Clears the auto-hide timer.
   - Restores `#conversation-partner` to the partner's normal name.

**Server-side handlers** relay these events to everyone else in the conversation room (`socket.to(conversationId)`), so the sender never sees their own typing indicator.

---

### 4.5 `deleteConversation()`

**What it does:** Deletes the currently open conversation and all its messages.

**Step-by-step:**

1. Shows a "Deleting conversation..." toast.
2. Sends `DELETE /inbox/conversation/:conversationId` via `fetch`.
3. If successful:
   - Removes the conversation element from `#conversation-list` using `data-conversation-id` selector.
   - Clears `#chat-message-list` and shows "no conversation" placeholder.
   - Clears `#conversation-partner` text.
   - Hides the send form (`visibility: hidden`).
   - Shows "Conversation deleted successfully." toast.
4. If failed:
   - Shows an error toast with the server's error message.

**Real-time removal for the other participant:**

The server also broadcasts `conversation_deleted` to all connected clients after deleting. The client listener (`socket.on("conversation_deleted", …)`):

- Removes the matching `<div class="conversation">` from `#conversation-list` by `data-conversation-id`.
- If the deleted conversation is the one currently open, clears the message list, resets the title, hides the send form, and stops any pending typing timers.
- The listener is idempotent: if the element was already removed by the local `DELETE` response, nothing happens.

---

## 5. Template Variables

These variables are available inside `inbox.ejs`:

| Variable | Where It Comes From | What It Contains |
|----------|---------------------|------------------|
| `data` | `res.locals.data` (set by `getInbox`) | Array of conversations |
| `loginUser` | `res.locals.loginUser` (set by auth middleware) | Logged-in user's `id`, `username`, etc. |
| `moment` | `res.locals.moment` (set by `getInbox`) | The moment.js library for date formatting |

---

## 6. Data Flow Example

### Step 1 — Open inbox:
- Browser requests `GET /inbox/`
- Server runs `getInbox`
- Server queries conversations for the user
- Server renders `inbox.ejs` with the conversation list
- User sees a list of conversations

### Step 2 — Click a conversation:
- Browser runs `getMessages(convId, partnerName)`
- Browser requests `GET /inbox/messages/convId`
- Server runs `getMessages`
- Server checks user owns the conversation
- Server fetches messages and other user info
- Server returns JSON
- Browser renders messages in `#chat-message-list`
- Browser shows the partner name in `#conversation-partner`
- Browser makes the send form visible
- **Browser emits `join_conversation` to Socket.io server**

### Step 3 — Send a message:
- User types text and clicks send
- Browser runs `form.onsubmit`
- Browser sends `POST /inbox/message` with text + files
- Server runs `sendMessage`
- Server saves message to database
- Server updates conversation `last_updated`
- Server populates sender/receiver
- **Server emits `new_message` to conversation room via Socket.io**
- Server returns success
- Browser clears the input field
- **Other users in the same conversation receive the message instantly via `socket.on("new_message")`**

---

## 7. Middleware

### `attachmentUpload`

**File:** `src/middlewares/chat/attachmentUpload.ts`

Used by `POST /inbox/message`. It uses Multer with **memory storage** to parse
uploaded files, which `sendMessage` then streams to Cloudinary.

**Allowed file types:**
- Images: JPEG, PNG, GIF, WebP
- Documents: PDF, DOC, DOCX, XLS, XLSX, TXT
- Max file size: 20MB

Each file is uploaded to `chat_application/messages/<conversationId>` using
`resource_type: "auto"`, and the message stores `{ public_id, url, resource_type }` per file.

---

## 8. Socket.io Integration

### Server-side: `src/socket.ts`

```typescript
let io: Server | null = null;

export const initIo = (server: any) => {
  io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
  
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Join a room based on the conversation ID
    socket.on("join_conversation", (conversationId: string) => {
      if (!conversationId) return;

      // Leave previous conversation rooms so we only receive events for
      // the conversation currently being viewed.
      for (const room of socket.rooms) {
        if (room !== socket.id) socket.leave(room);
      }

      socket.join(conversationId);
      console.log(`User ${socket.id} joined room: ${conversationId}`);
    });

    // Typing indicator relay
    socket.on("typing", (data) => {
      const { conversationId, senderId, senderName } = data;
      if (!conversationId) return;
      socket
        .to(conversationId)
        .emit("typing", {
          conversationId,
          userId: senderId,
          userName: senderName,
        });
    });

    socket.on("stop-typing", (data) => {
      const { conversationId, senderId, senderName } = data;
      if (!conversationId) return;
      socket
        .to(conversationId)
        .emit("stop-typing", {
          conversationId,
          userId: senderId,
          userName: senderName,
        });
    });

    socket.on("disconnect", () => {
      console.log("A user disconnected:", socket.id);
    });
  });
};

export const getIo = (): Server => { ... };
```

`initIo` returns nothing; controllers get the shared instance later via
`getIo()`.

**Initialized in `src/index.ts`:**
```typescript
initIo(server);
```

### Client-side: `inbox.ejs`

```javascript
const socket = io(localHost);

// Rejoin the open conversation after a reconnect, otherwise typing and
// live messages stop working silently.
socket.on("connect", () => {
  if (current_conversation_id) {
    socket.emit("join_conversation", current_conversation_id);
  }
});

socket.on("new_message", (data) => { ... });  // Handle incoming messages

// Typing indicator
chatInput.addEventListener("input", () => {
  socket.emit("typing", {
    conversationId: current_conversation_id,
    isTyping: true,
    senderId: loginUserId,
    senderName: loginUserName,
  });
});

socket.on("typing", ({ conversationId, userId, userName }) => {
  if (conversationId === current_conversation_id) {
    chatTitleContainer.textContent = `${userName} is typing...`;
  }
});

socket.on("stop-typing", ({ conversationId, userId, userName }) => {
  if (conversationId === current_conversation_id) {
    chatTitleContainer.textContent = userName;
  }
});

// When joining a conversation:
socket.emit("join_conversation", conversationId);
```

### How It Works

| Event | Direction | Purpose |
|-------|-----------|---------|
| `join_conversation` | Client → Server | Join a room for a specific conversation |
| `typing` | Client → Server | Signal that the user is typing in a conversation |
| `stop-typing` | Client → Server | Signal that the user stopped typing |
| `typing` | Server → Client | Relay "is typing..." to other room members |
| `stop-typing` | Server → Client | Relay "stopped typing" to other room members |
| `new_message` | Server → Client | Broadcast new message to all room members |
| `conversation_deleted` | Server → Client | Notify all clients that a conversation was deleted (sidebar removal) |
| `disconnect` | Client → Server | Clean up on disconnect |

**Room = `conversationId`** — all participants in a conversation join the same room. Socket events use `socket.to(room)` so the sender never receives their own typing indicator.

---

## 9. Recent Fixes & Improvements

### 9.1 Attachment Upload Fix
- **Problem:** Empty `allowed_file_types` array rejected all files
- **Fix:** Added proper mimetype list in `attachmentUpload.ts`

### 9.2 Conversation Validation
- **Self-conversation prevention:** Cannot create conversation with yourself
- **Duplicate prevention:** Checks both directions (A-B and B-A) before creating

### 9.3 Template Bug Fixes
| Issue | Fix |
|-------|-----|
| `data.message.conversation_id` vs `conversationId` | Use `conversationId` (camelCase) |
| `sender === loginUserId` (object vs string) | Use `sender._id === loginUserId` |
| `data.message.message` vs `text` | Model field is `text` |
| Message insertion fails on empty list | Safe insertion with `firstChild` check |
| Missing room join on conversation click | Added `socket.emit("join_conversation")` |

### 9.4 Socket.io Real-time Messaging
- Server emits `new_message` after saving message
- Client receives and renders instantly (no refresh needed)
- Works for other users in the same conversation

### 9.5 Socket.io Typing Indicators
- **Server:** `src/socket.ts` relays `typing` and `stop-typing` events to all other members of a conversation room (`socket.to(conversationId)`).
- **Client:** `views/inbox.ejs` emits `typing` on input with a 1.5s debounce, listens for `typing`/`stop-typing` to show/hide the indicator in `#conversation-partner`, auto-hides after 3s if `stop-typing` never arrives, stops typing when switching conversations or sending a message, and re-joins the room on socket reconnect.
- The server guards empty `conversationId` on `join_conversation`, `typing`, and `stop-typing` so no event leaks to `socket.to(undefined)`.

### 9.6 Form Validation
- Client-side validation before sending
- Checks: message not empty, participant selected, conversation ID set
- Clear error messages via Toastify

---

## 10. What Is NOT Included

- **Group chat:** Current implementation is 1-on-1 only (creator + participant). Group chat would require schema changes (participants array) and new endpoints.
- **Message read receipts:** Not implemented.
- **Message edit/delete:** Not implemented.

---

## 11. File Structure Summary

```
src/
├── controllers/
│   ├── inbox.ts          # getInbox, searchUser, addConversation, getMessages, deleteConversation, searchConversation
│   └── sendMessage.ts    # sendMessage (with socket emit)
├── middlewares/
│   └── chat/
│       ├── attachmentUpload.ts  # Multer for chat attachments
│       └── conversationAuth.ts  # conversationParticipant authorization middleware
├── models/
│   ├── conversation.ts   # creator, participant, last_updated
│   ├── message.ts        # text, sender, receiver, conversations, attachment[{ public_id, url, resource_type }]
│   └── user.ts           # name, email, mobile, public_id, url, etc.
├── router/
│   └── inbox.ts          # Route definitions
├── socket.ts             # Socket.io setup (initIo, getIo)
└── index.ts              # App entry, initializes socket

views/
├── inbox.ejs             # Main inbox template
└── partials/
    ├── add-conversation-modal.ejs
    ├── header.ejs
    └── footer.ejs

public/
├── images/
├── js/
│   ├── moment.js
│   └── toastify.js
└── stylesheets/
    └── style.css
```

---

## 12. Known Issues / Future Work

1. **Mobile search:** The pattern anchors to the stored number's start after stripping `+88` from the query; mixed storage formats can fail to match
2. **No group chat:** Schema only supports 2 participants
3. **No message edit/delete:** Once sent, messages cannot be modified
4. **No read receipts:** Cannot see if message was read
5. **Socket reconnection:** Basic rejoin logic added on socket connect, but no full reconnection backoff strategy or queued message handling on disconnect.