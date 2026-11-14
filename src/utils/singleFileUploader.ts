import createError from "http-errors";
import multer from "multer";
import path from "node:path";

/**
 * Creates a Multer uploader that stores files in `public/uploads/<subfolder_path>`.
 * Filenames are normalized and timestamped to avoid collisions.
 *
 * @param subfolder_path - Destination folder under `public/uploads`.
 * @param allowed_file_types - Accepted MIME types.
 * @param max_file_size - Maximum file size in bytes.
 * @param err_msg - Error message for rejected file types.
 * @returns A configured Multer instance.
 */
export const uploader = (
  subfolder_path: string,
  allowed_file_types: string[],
  max_file_size: number,
  err_msg: string,
) => {
  const UPLOAD_FOLDER = path.join(
    import.meta.dirname,
    `../../public/uploads/${subfolder_path}`,
  );

  const storage = multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, UPLOAD_FOLDER);
    },
    filename(_req, file, cb) {
      const fileExt = path.extname(file.originalname);
      const filename = file.originalname
        .replace(fileExt, "")
        .toLowerCase()
        .split(" ")
        .join("-");

      cb(null, `${filename}+${Date.now()}${fileExt}`);
    },
  });

  const upload = multer({
    storage,
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
