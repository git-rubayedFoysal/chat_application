import type { RequestHandler } from "express";
import User from "../models/user.js";
import { hash } from "argon2";
import { unlink } from "node:fs/promises";
import path from "node:path";

export const getUsers: RequestHandler = async (_req, res, next) => {
  try {
    // .lean() returns plain objects instead of full Mongoose documents, which
    // is enough here because the rows are only read, never saved.
    const users = await User.find()
      .select("_id name email mobile avatar")
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

  const avatar =
    Array.isArray(req.files) && req.files.length > 0
      ? req.files[0]?.filename
      : undefined;

  try {
    const hashedPassword = await hash(password);

    await User.create({
      name,
      email,
      mobile,
      password: hashedPassword,
      ...(avatar !== undefined && { avatar }),
    });

    return res.status(201).json({
      message: "User was added successfully!",
    });
  } catch (error) {
    return res.status(500).json({
      errors: {
        common: {
          msg: "Unknown error occur.",
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

    // Remove the avatar from disk so deleted users don't leave orphaned files.
    if (user.avatar) {
      await unlink(
        path.join(
          import.meta.dirname,
          `../../public/uploads/avatars/${user.avatar}`,
        ),
      );
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
