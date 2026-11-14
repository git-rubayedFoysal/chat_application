# File Uploads

This document explains how **file uploads** work in the chat application. It
covers:

1. The shared **uploader factory** (`src/utils/singleFileUploader.ts`)
2. The two upload middlewares (**avatar** and **attachment**)
3. **Storage and naming** on disk
4. **Route wiring** and middleware order
5. **Cleanup** of rejected uploads
6. **Known limitations**

No diagrams are used — everything is explained in plain text.

---

## 1. The Uploader Factory

**File:** `src/utils/singleFileUploader.ts`

`uploader(subfolder_path, allowed_file_types, max_file_size, err_msg)` builds
a Multer instance with disk storage:

- **Destination:** `public/uploads/<subfolder_path>`, resolved relative to the
  module (`import.meta.dirname`), so the path is stable regardless of the
  working directory.
- **Filename:** the original name lowercased with spaces replaced by hyphens,
  plus a `+<timestamp>` suffix before the extension:
  ```typescript
  cb(null, `${filename}+${Date.now()}${fileExt}`);
  ```
  **Why:** two files with the same name cannot overwrite each other, and the
  normalized name is URL-safe.
- **Size limit:** `limits.fileSize` rejects anything over the configured
  maximum.
- **Type filter:** the MIME type must be in `allowed_file_types`; otherwise
  Multer receives `createError(err_msg)` and the upload is rejected.

---

## 2. The Two Upload Middlewares

| Setting | `avatarUpload` | `attachmentUpload` |
|---------|----------------|--------------------|
| File | `src/middlewares/users/avatarUpload.ts` | `src/middlewares/chat/attachmentUpload.ts` |
| Folder | `public/uploads/avatars/` | `public/uploads/attachments/` |
| Allowed types | `image/jpg`, `image/jpeg`, `image/png` | JPEG, PNG, GIF, WebP, PDF, DOC, DOCX, XLS, XLSX, TXT |
| Max size | 5 MB | 20 MB |
| Error message | "Only .jpg, .jpeg, .png formate are allowed!" | "File type not allowed. Allowed: images, PDF, DOC, XLS, TXT." |
| Error field | `errors.avatar` | `errors.common` |
| Status on failure | `500` JSON | `500` JSON |

Both call `upload.any()`, which accepts any field name but only the **first**
file is used by the controllers.

---

## 3. Route Wiring and Middleware Order

**Users — `src/router/user.ts`:**

```typescript
router.post("/", avatarUpload, addUserValidator, addUserValidatorHandler, addUser);
```

**Inbox — `src/router/inbox.ts`:**

```typescript
router.post("/message", attachmentUpload, sendMessage);
```

**Why the order matters:** Multer must parse the multipart body before any
validator or controller reads `req.body` or `req.files`. In the users route the
validator handler also needs the files present so it can clean them up on
failure (section 5).

---

## 4. How Uploaded Files Are Referenced

- **Avatar:** `addUser` stores `req.files[0].filename` on the user. Templates
  render `./uploads/avatars/<avatar>` (or `nophoto.png` when absent). The file
  is served by `express.static("public")` mounted in `src/index.ts`.
- **Attachments:** `sendMessage` maps every uploaded file to its filename and
  stores the array on `message.attachment`. Templates render
  `./uploads/attachments/<filename>` per entry.

Only filenames are persisted; the database never holds file contents.

---

## 5. Cleanup of Rejected Uploads

Multer writes files to disk **before** validation runs. If `addUserValidator`
fails, `addUserValidatorHandler` deletes every uploaded file:

```typescript
if (Array.isArray(req.files)) {
  await Promise.all(
    req.files.map((file) =>
      unlink(path.join(import.meta.dirname, `../../../public/uploads/avatars/${file.filename}`))
    )
  );
}
```

**Why:** without this, every failed registration would leave an orphaned file
under `public/uploads/avatars/`.

The same cleanup exists on user deletion: `removeUser` unlinks
`public/uploads/avatars/<avatar>` when the deleted user had an avatar.

---

## 6. Known Limitations

- **No per-user or total quota** — only a per-file size cap.
- **No virus/malware scanning** — content is trusted by MIME type only.
- **`image/jpg` is non-standard** (the standard type is `image/jpeg`); it is
  kept in the whitelist so clients that send it are not rejected.
- **Filenames derive from the client-provided original name**; the
  normalization removes spaces but the original basename should be treated as
  untrusted input.
- **Attachments are not deleted** when a message or conversation is removed;
  the file stays on disk.
- **Local disk only** — uploads do not survive instance replacement and are
  not shared across multiple servers.

---

## See Also

- `docs/users.md` — the avatar upload route and modal.
- `docs/inbox.md` — the attachment upload route and chat form.
- `docs/data-model.md` — how filenames are stored in the schemas.
- `docs/routes.md` — full route and middleware map.
