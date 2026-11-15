# File Uploads

This document explains how **file uploads** work in the chat application. It
covers:

1. The shared **uploader factory** (`src/utils/singleFileUploader.ts`)
2. The **Cloudinary configuration** and upload helper
3. The two upload middlewares (**avatar** and **attachment**)
4. **How files are stored and referenced**
5. **Route wiring** and middleware order
6. **Cleanup** of Cloudinary assets
7. **Known limitations**

No diagrams are used — everything is explained in plain text.

---

## 1. The Uploader Factory

**File:** `src/utils/singleFileUploader.ts`

`uploader(allowed_file_types, max_file_size, err_msg, options?)` builds a Multer
instance. By default it uses **memory storage** (`req.files[n].buffer`), which is
what the Cloudinary flow needs. Passing `options.disk` switches it to disk
storage under `public/uploads/<subfolder>` (kept for cases where local files are
required).

- **Allowed types:** the MIME type must be in `allowed_file_types`; otherwise
  Multer receives `createError(err_msg)` and the upload is rejected.
- **Size limit:** `limits.fileSize` rejects anything over the configured maximum.
- **Disk mode (optional):** files are written to
  `public/uploads/<subfolder>`, with the original name lowercased and spaces
  replaced by hyphens, plus a `+<timestamp>` suffix before the extension:
  ```typescript
  cb(null, `${filename}+${Date.now()}${fileExt}`);
  ```
  **Why:** two files with the same name cannot overwrite each other, and the
  normalized name is URL-safe.

---

## 2. Cloudinary Configuration and Upload Helper

**Config:** `src/config/cloudinary.ts`

```typescript
cloudinary.config({ secure: true });
```

The SDK reads `CLOUDINARY_URL` (`cloudinary://<api_key>:<api_secret>@<cloud_name>`)
from the environment automatically. In Cloudinary v2 `secure` already defaults
to `true`, and HTTPS URLs are generated.

**Helper:** `src/utils/uploadToCloudinary.ts`

```typescript
export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  resource_type: "image" | "auto" = "image",
  mimetype?: string,
): Promise<UploadApiResponse> => {
  // Delivery transforms rasterize PDFs at upload time, so only send them for
  // real raster images.
  const optimizeDelivery =
    !mimetype || /^image\/(jpe?g|png|gif|webp)$/i.test(mimetype);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type,
        ...(optimizeDelivery
          ? { quality: "auto:best", fetch_format: "auto" }
          : {}),
      },
      (error, result) => {
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error("Upload returned no result"));
      },
    );

    stream.end(buffer);
  });
};
```

- Uploads a memory buffer (no temporary file on disk).
- `folder` organizes assets, e.g. `chat_application/users/avatar/<email>` or
  `chat_application/messages/<conversationId>`.
- `resource_type: "auto"` lets PDFs and office documents use the correct
  pipeline; the default `"image"` is used for avatars.
- `quality` / `fetch_format` are only requested for raster images
  (`image/jpeg`, `image/png`, `image/gif`, `image/webp`). Passing them while
  uploading a PDF makes Cloudinary flatten the first page into a PNG, which
  would lose the document — so `sendMessage` passes `file.mimetype` and
  documents are uploaded untouched.
- Resolves with Cloudinary's `UploadApiResponse`, which includes `public_id` and
  `secure_url`.

---

## 3. The Two Upload Middlewares

| Setting | `avatarUpload` | `attachmentUpload` |
|---------|----------------|--------------------|
| File | `src/middlewares/users/avatarUpload.ts` | `src/middlewares/chat/attachmentUpload.ts` |
| Storage | Memory (streamed to Cloudinary) | Memory (streamed to Cloudinary) |
| Allowed types | `image/jpg`, `image/jpeg`, `image/png` | JPEG, PNG, GIF, WebP, PDF, DOC, DOCX, XLS, XLSX, TXT |
| Max size | 5 MB | 20 MB |
| Error message | "Only .jpg, .jpeg, .png formate are allowed!" | "File type not allowed. Allowed: images, PDF, DOC, XLS, TXT." |
| Error field | `errors.avatar` | `errors.common` |
| Status on failure | `500` JSON | `500` JSON |

Both call `upload.any()`, so any field name is accepted and every file is
available on `req.files` as a buffer.

---

## 4. Route Wiring and Middleware Order

**Users — `src/router/user.ts`:**

```typescript
router.post("/", avatarUpload, addUserValidator, addUserValidatorHandler, addUser);
```

**Inbox — `src/router/inbox.ts`:**

```typescript
router.post("/message", attachmentUpload, sendMessage);
```

**Why the order matters:** Multer must parse the multipart body before any
validator or controller reads `req.body` or `req.files`. Because files are kept
in memory, validation that fails simply discards the buffers — there is nothing
on disk to clean up.

---

## 5. How Uploaded Files Are Referenced

- **Avatar:** `addUser` uploads `req.files[0].buffer` through
  `uploadToCloudinary(..., "image")` and stores `public_id` and `url`
  (`secure_url`) on the user. Templates render `user.url` directly, or
  `./images/nophoto.png` when absent.
- **Attachments:** `sendMessage` uploads every file with
  `resource_type: "auto"` and stores an array of
  `{ public_id, url, resource_type }` objects on `message.attachment`.
  `resource_type` is the concrete pipeline Cloudinary returned (`image` for
  photos/PDFs, `raw` for DOC/XLS/TXT), kept so the asset can be deleted later.
  Templates render `attachment.url` (real images inline; PDFs and other
  documents as download links).

The database never stores file contents — only the Cloudinary identifiers and
URLs needed to display and later delete each asset.

---

## 6. Cleanup of Cloudinary Assets

- **User deletion:** `removeUser` calls
  `cloudinary.uploader.destroy(user.public_id)` for the user's avatar.
- **Conversation deletion:** `deleteConversation` loads every message's
  attachments, then destroys each `public_id` using the stored `resource_type`
  (legacy entries without one default to `image`) before removing the DB records
  so a failed call can be retried.

Avatar uploads happen **after** validation succeeds, so rejected registrations
never create Cloudinary assets to clean up.

---

## 7. Known Limitations

- **No per-user or total quota** — only a per-file size cap.
- **No virus/malware scanning** — content is trusted by MIME type only.
- **`image/jpg` is non-standard** (the standard type is `image/jpeg`); it is
  kept in the whitelist so clients that send it are not rejected.
- **Attachments are not deleted per message** — individual message deletion is
  not implemented, so assets live until the whole conversation is deleted.
- **Requires Cloudinary credentials** — the app needs a valid `CLOUDINARY_URL`;
  there is no local-storage fallback wired into the controllers.

---

## See Also

- `docs/users.md` — the avatar upload route and modal.
- `docs/inbox.md` — the attachment upload route and chat form.
- `docs/data-model.md` — how Cloudinary identifiers are stored in the schemas.
- `docs/routes.md` — full route and middleware map.
