import createError from "http-errors";
import multer from "multer";

/**
 * Creates a Multer uploader. By default files are kept in memory; pass
 * `options.disk` to persist them under `public/uploads/<subfolder>` with
 * normalized, timestamped filenames that avoid collisions.
 *
 * @param allowed_file_types - Accepted MIME types.
 * @param max_file_size - Maximum file size in bytes.
 * @param err_msg - Error message for rejected file types.
 * @param options - Storage options (memory by default).
 * @returns A configured Multer instance.
 */
export const uploader = (
  allowed_file_types: string[],
  max_file_size: number,
  err_msg: string,
) => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: max_file_size,
    },
    fileFilter(_req, file, cb) {
      if (allowed_file_types.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(createError(err_msg));
      }
    },
  });

  return upload;
};
