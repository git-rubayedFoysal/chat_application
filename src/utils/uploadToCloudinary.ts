import cloudinary from "../config/cloudinary.js";
import type { UploadApiResponse } from "cloudinary";

// Requesting a delivery transformation (`quality` / `fetch_format`) while
// uploading a PDF makes Cloudinary rasterize the first page into an image, so
// the stored asset becomes a `.png` instead of a `.pdf`. Only apply those
// optimizations to real raster images.
const RASTER_IMAGE = /^image\/(jpe?g|png|gif|webp)$/i;

export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  resource_type: "image" | "auto" = "image",
  mimetype?: string,
): Promise<UploadApiResponse> => {
  // No mimetype means the caller already knows it is an image (avatars).
  const optimizeDelivery = !mimetype || RASTER_IMAGE.test(mimetype);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type,
        // Preserve near-original visual quality and deliver WebP/AVIF when the
        // browser supports it. Skipped for documents so PDFs stay PDFs.
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
