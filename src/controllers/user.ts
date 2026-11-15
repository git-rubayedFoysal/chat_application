import type { RequestHandler } from "express";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";
import User from "../models/user.js";
import { hash } from "argon2";
import createError from "http-errors";
import cloudinary from "../config/cloudinary.js";

export const getUsers: RequestHandler = async (_req, res, next) => {
  try {
    // .lean() returns plain objects instead of full Mongoose documents, which
    // is enough here because the rows are only read, never saved.
    const users = await User.find()
      .select("_id name email mobile public_id url")
      .lean();

    res.render("users", {
      users: users,
    });
  } catch (error) {
    next(error);
  }
};

export const addUser: RequestHandler = async (req, res) => {
  const { name, email, mobile, password } = req.body;
  let avatarPublicId: string | null = null;
  let avatarUrl: string | null = null;

  const file =
    Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : undefined;

  try {
    const hashedPassword = await hash(password);

    if (file?.buffer) {
      const result = await uploadToCloudinary(
        file.buffer,
        `chat_application/users/avatar/${email}`,
        "image",
      );

      if (!result || !result.public_id || !result.secure_url) {
        throw createError("Avatar upload failed!");
      }

      avatarPublicId = result.public_id;
      avatarUrl = result.secure_url;
    }

    await User.create({
      name,
      email,
      mobile,
      password: hashedPassword,
      ...(avatarPublicId && {
        public_id: avatarPublicId,
        url: avatarUrl,
      }),
    });

    return res.status(201).json({
      message: "User was added successfully!",
    });
  } catch (error) {
    return res.status(500).json({
      errors: {
        common: {
          msg: "Unknown error occurred.",
        },
      },
    });
  }
};

export const removeUser: RequestHandler = async (req, res): Promise<void> => {
  const { id } = req.params;

  try {
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      res.status(404).json({
        errors: {
          common: {
            msg: "User not found.",
          },
        },
      });
      return;
    }

    // Remove the avatar from Cloudinary so deleted users don't leave orphaned files.
    if (user.public_id) {
      await cloudinary.uploader.destroy(user.public_id);
    }

    res.status(200).json({
      message: "User was removed successfully!",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      errors: {
        common: {
          msg: "Unknown error occurred.",
        },
      },
    });
  }
};
