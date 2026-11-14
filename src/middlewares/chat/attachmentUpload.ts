import type { RequestHandler } from "express";
import { uploader } from "../../utils/singleFileUploader.js";

export const attachmentUpload: RequestHandler = (req, res, next) => {
  // Chat attachments cover images plus common documents, capped at 20 MB.
  const upload = uploader(
    "attachments",
    [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ],
    20 * 1024 * 1024,
    "File type not allowed. Allowed: images, PDF, DOC, XLS, TXT.",
  );

  upload.any()(req, res, (err) => {
    if (err) {
      res.status(500).json({
        errors: {
          common: {
            msg: err.message,
          },
        },
      });
    } else {
      next();
    }
  });
};
