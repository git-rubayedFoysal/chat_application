import type { RequestHandler } from "express";
import User from "../models/user.js";
import createError from "http-errors";
import { verify } from "argon2";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const getLogin: RequestHandler = (req, res): void => {
  if (req.user) {
    res.redirect("/inbox");
    return;
  }
  res.render("index");
};

export const login: RequestHandler = async (req, res) => {
  try {
    const user = await User.findOne({
      $or: [{ email: req.body.username }, { mobile: req.body.username }],
    });

    if (!user || !user._id) {
      throw createError(404, "Requested user was not found.");
    }

    const isValidPassword = await verify(user.password, req.body.password);

    if (!isValidPassword) {
      throw createError(400, "Invalid Username or Password. Try again.");
    }

    const userObj = {
      id: user._id,
      username: user.name,
      email: user.email,
      mobile: user.mobile,
      public_id: user.public_id,
      url: user.url,
      role: user.role,
    };

    // The JWT carries the role so route guards can authorize without a DB lookup.
    const token = jwt.sign(userObj, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRATION,
    });

    // httpOnly keeps the token out of client-side JS; signed prevents tampering.
    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      signed: true,
      maxAge: env.COOKIE_MAX_AGE,
    });

    res.locals.loginUser = userObj;

    res.redirect("/inbox");
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Login Failed! Try again.";

    if (res.headersSent) {
      throw createError(500, message);
    }

    res.render("index", {
      data: {
        username: req.body.username,
      },
      errors: {
        common: {
          msg: message,
        },
      },
    });
  }
};

export const logout: RequestHandler = (_req, res) => {
  res.clearCookie(env.COOKIE_NAME);
  res.json({ message: "Logout successful." });
};
