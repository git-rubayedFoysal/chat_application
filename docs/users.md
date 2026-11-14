# User Management Module

This document explains how the **user management feature** works in the chat application. It covers:

1. The **routes** (how the browser talks to the server)
2. The **template** (`views/users.ejs`) (what the user sees)
3. The **data flow** (step-by-step what happens when you manage users)
4. **Middleware and validation**
5. **Recent fixes and improvements**

No diagrams are used — everything is explained in plain text.

---

## 1. Routes Overview

All user routes are mounted under `/users` in `src/index.ts` and defined in `src/router/user.ts`.

| Method | Path | Controller | What It Does |
|--------|------|------------|--------------|
| `GET` | `/users/` | `getUsers` | Show the user management page with all users |
| `POST` | `/users/` | `addUser` | Create a new user with optional avatar upload |
| `DELETE` | `/users/:id` | `removeUser` | Delete a user and their avatar file |

---

## 2. Route Details

### 2.1 `GET /users/` — List Users

**Controller:** `getUsers` in `src/controllers/user.ts`

**What happens step-by-step:**

1. Queries the `User` collection for all users.
2. Selects only these fields: `_id`, `name`, `email`, `mobile`, `avatar`.
3. Uses `.lean()` for faster plain JavaScript object output.
4. Renders the `users.ejs` template with the users array.

**Template variables:** `users` — array of user objects.

---

### 2.2 `POST /users/` — Create User

**Controller:** `addUser` in `src/controllers/user.ts`

**What happens step-by-step:**

1. Receives `name`, `email`, `mobile`, `password` from the request body.
2. Receives optional avatar file from `req.files` (handled by `avatarUpload` middleware).
3. Hashes the password using `argon2` (`hash` function).
4. Creates a new `User` document with:
   - `name`
   - `email`
   - `mobile`
   - `password` (hashed)
   - `avatar` (filename, if uploaded)
5. Returns 201 with success message: `{ "message": "User was added successfully!" }`

**On failure:** Returns 500 with error: `{ "errors": { "common": { "msg": "Unknown error occur." } } }`

---

### 2.3 `DELETE /users/:id` — Delete User

**Controller:** `removeUser` in `src/controllers/user.ts`

**What happens step-by-step:**

1. Receives `id` from the URL parameters.
2. Finds and deletes the user by ID using `User.findByIdAndDelete(id)`.
3. If user not found, returns 404: `{ "errors": { "common": { "msg": "User not found." } } }`
4. If user had an avatar file, deletes it from `public/uploads/avatars/`.
5. Returns 200 with success message: `{ "message": "User was removed successfully!" }`

**On failure:** Returns 500 with error: `{ "errors": { "common": { "msg": "Unknown error occurred." } } }`

---

## 3. Template: `views/users.ejs`

The user management page template is an EJS file that mixes HTML with server-side JavaScript tags.

### 3.1 Includes (Shared Parts)

| Include | File | Purpose |
|---------|------|---------|
| Header | `./partials/header.ejs` | HTML `<head>`, navigation menu, logout button |
| Modal | `./partials/user.modal.ejs` | Popup to create a new user |
| Footer | `./partials/footer.ejs` | Closing `</body>` and `</html>` tags |

---

### 3.2 User List Table

```ejs
<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Email</th>
      <th>Manage</th>
    </tr>
  </thead>
  <tbody id="users-table">
    <% users.forEach(user => { %>
      <tr id="<%= user._id %>">
        <td class="name">
          <% if (user.avatar) { %>
            <img src="./uploads/avatars/<%= user.avatar %>" />
          <% } else { %>
            <img src="./images/nophoto.png" />
          <% } %>
          <span>
            <%= user.name %>
          </span>
        </td>
        <td>
          <%= user.email %>
        </td>
        <td class="manage">
          <img src="./images/trash.png" alt="Delete" onclick="deleteUser('<%= user._id %>')" />
        </td>
      </tr>
    <% }) %>
  </tbody>
</table>
```

**Each user row shows:**
1. Avatar image (or `nophoto.png` if none)
2. User name
3. User email
4. Delete button (trash icon) — calls `deleteUser(userId)`

**Empty state:** If there are no users, the table body will be empty (no placeholder message).

---

### 3.3 New User Button

```ejs
<div class="new-message-container new-user">
  <a href="#" onclick="openModal()">+</a>
</div>
```

Clicking the `+` button opens the "Create New User" modal (loaded from `user.modal.ejs`).

---

### 3.4 Create User Modal

**File:** `views/partials/user.modal.ejs`

The modal contains a form with the following fields:

| Field | Type | Name | Validation |
|-------|------|------|------------|
| Name | text | `name` | Required, 3-100 chars, alphabets only |
| Email | text | `email` | Required, valid email, unique |
| Mobile | text | `mobile` | Required, Bangladeshi format, unique |
| Password | password | `password` | Required, strong (8+ chars, upper+lower+number+symbol) |
| Avatar | file | `avatar` | Optional, jpg/jpeg/png only, max 5MB |

**Error placeholders:** Each field has a corresponding `<p class="error [field]-error"></p>` element that displays validation errors.

---

## 4. JavaScript Functions

### 4.1 `openModal()` / `closeModal()`

**File:** `views/partials/user.modal.ejs`

- `openModal()`: Sets the add-user modal to `display: block`
- `closeModal()`: Sets the add-user modal to `display: none`

---

### 4.2 `deleteUser(userId)`

**File:** `views/users.ejs`

**Step-by-step:**

1. Sends `DELETE /users/:userId` via `fetch`.
2. Parses the JSON response.
3. If successful:
   - Shows "User was deleted successfully." toast.
   - Removes the user row from the table (`document.getElementById(userId).remove()`).
4. If failed:
   - Shows "Unknown error occur. Please try again later." toast.

**Toasts:**
- `deleteToast`: Success message (2 seconds duration)
- `deleteErrorToast`: Error message (2 seconds duration)

---

### 4.3 Add User Form Submit Handler

**File:** `views/partials/user.modal.ejs`

**Step-by-step:**

1. Prevents the page from reloading.
2. Clears all error displays:
   - Hides all `<p class="error">` elements.
   - Removes `error` class from all `<input>` elements.
3. Collects form data into `FormData`.
4. Sends `POST /users` with `FormData` (includes avatar file if selected).
5. Parses the JSON response.
6. If errors:
   - For each error field, adds `error` class to the corresponding input.
   - Sets the error message in the corresponding `<p class="error [field]-error"></p>` element.
   - Makes error placeholders visible.
7. If success:
   - Shows "User was added successfully! Reloading the list..." toast.
   - Closes the modal.
   - Reloads the page after 1 second.

---

## 5. Middleware and Validation

### `avatarUpload`

**File:** `src/middlewares/users/avatarUpload.ts`

Uses Multer to handle avatar file uploads:

| Setting | Value |
|---------|-------|
| Upload folder | `public/uploads/avatars/` |
| Allowed types | `image/jpg`, `image/jpeg`, `image/png` |
| Max file size | 5 MB |
| Error message | "Only .jpg, .jpeg, .png formate are allowed!" |

Uses `upload.any()` to accept multiple files (though only the first is used).

---

### `addUserValidator`

**File:** `src/middlewares/users/userValidator.ts`

Uses `express-validator` to validate the request body:

| Field | Rule | Error Message |
|-------|------|---------------|
| `name` | `isLength({ min: 3, max: 100 })` | "Name must be between 3 and 100 characters long." |
| `name` | `isAlpha("en-US", { ignore: " -" })` | "Name must not contain anything other than alphabets." |
| `email` | `isEmail()` | "Email must be a valid email address." |
| `email` | Custom (DB check) | "Email already in use." |
| `mobile` | `isMobilePhone("bn-BD")` | "Number must be a valid Bangladeshi mobile number." |
| `mobile` | Custom (DB check) | "Mobile number already in use." |
| `password` | `isStrongPassword()` | "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one symbol." |

All text fields are trimmed.

---

### `addUserValidatorHandler`

**File:** `src/middlewares/users/userValidator.ts`

**What it does:**

1. Collects validation results from `express-validator`.
2. If there are errors:
   - Deletes any uploaded avatar files (cleanup).
   - Returns 400 with mapped errors as JSON.
3. If no errors, calls `next()` to proceed to `addUser` controller.

---

## 6. Template Variables

These variables are available inside `users.ejs`:

| Variable | Where It Comes From | What It Contains |
|----------|---------------------|------------------|
| `users` | `res.render("users", { users })` | Array of user objects with `_id`, `name`, `email`, `mobile`, `avatar` |
| `loginUser` | `res.locals.loginUser` (set by auth middleware) | Logged-in user object (for header menu) |

---

## 7. Data Flow Example

### Step 1 — Open user management:
- Browser requests `GET /users`
- `checkAuthentication` middleware checks for a valid cookie
- `requireAuth` middleware ensures user is logged in
- `getUsers` controller runs:
  1. Queries all users from MongoDB
  2. Selects `_id`, `name`, `email`, `mobile`, `avatar`
  3. Renders `users.ejs` with the users array
- User sees a table of all users

### Step 2 — Create a new user:
- User clicks `+` button → modal opens
- User fills in name, email, mobile, password, and optional avatar
- User clicks Submit
- `avatarUpload` middleware saves the avatar file
- `addUserValidator` checks all fields
- `addUserValidatorHandler` returns 400 with errors if validation fails
- `addUser` controller runs:
  1. Hashes the password with argon2
  2. Creates the user document
  3. Returns 201 success
- Frontend shows success toast, closes modal, reloads page after 1 second

### Step 3 — Delete a user:
- User clicks trash icon next to a user
- `deleteUser(userId)` sends `DELETE /users/:userId`
- `removeUser` controller runs:
  1. Finds and deletes the user by ID
  2. Deletes the avatar file if it exists
  3. Returns success or error
- Frontend shows toast and removes the user row from the table

---

## 8. Authorization

The `/users` routes are protected by two layers of authorization in
`src/index.ts`:

1. `checkAuthentication` — soft gate that populates `req.user` from the
   signed JWT cookie (if present and valid).
2. `requireAuth(["admin"])` — hard gate that rejects unauthenticated
   users (401/redirect) and non-admin users (403).

Only users with the `"admin"` role can access `/users` routes. New users
are created with the default `"user"` role (see the `role` field in
`src/models/user.ts`).

For the route protection matrix, conversation-level authorization notes, and
response semantics per client type, see **`docs/authorization.md`**.
For the plain-text route map, see **`docs/routes.md`**.

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
│   ├── message.ts        # text, sender, receiver, conversations, attachment[]
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
├── uploads/
│   ├── avatars/
│   └── attachments/
├── js/
│   ├── moment.js
│   └── toastify.js
└── stylesheets/
    └── style.css
```

---

## 10. Known Issues / Future Work

1. **No user edit** — users can only be created and deleted, not edited
2. **No search/filter** — the user list shows all users without pagination or search
3. **No role management** — the `role` field exists in the schema but there's no UI to change it
4. **No self-delete protection** — a user could potentially delete their own account
5. **Avatar cleanup on validation error** — already implemented: uploaded avatar files are deleted when validation fails (`addUserValidatorHandler`)