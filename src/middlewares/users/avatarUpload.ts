import type { RequestHandler } from "express";
import { uploader } from "../../utils/singleFileUploader.js";

export const avatarUpload: RequestHandler = (req, res, next) => {
  const upload = uploader(
    ["image/jpg", "image/jpeg", "image/png"],
    5 * 1024 * 1024,
    "Only .jpg, .jpeg, .png formate are allowed!",
  );

  upload.any()(req, res, (err) => {
    if (err) {
      res.status(500).json({
        errors: {
          avatar: {
            msg: err.message,
          },
        },
      });
    } else {
      next();
    }
  });
};
