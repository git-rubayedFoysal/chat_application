import { body, validationResult } from "express-validator";
import User from "../../models/user.js";
import createError from "http-errors";
import type { RequestHandler } from "express";

export const addUserValidator = [
  body("name")
    .isLength({ min: 3, max: 100 })
    .withMessage("Name must be between 3 and 100 characters long.")
    .isAlpha("en-US", { ignore: " -" })
    .withMessage("Name must not contain anything other than alphabets.")
    .trim(),

  body("email")
    .isEmail()
    .withMessage("Email must be a valid email address.")
    .trim()
    .custom(async (value) => {
      const user = await User.findOne({ email: value });

      if (user) {
        throw createError("Email already in use.");
      }
      return true;
    }),

  body("mobile")
    .isMobilePhone("bn-BD")
    .withMessage("Number must be a valid Bangladeshi mobile number.")
    .custom(async (value) => {
      const user = await User.findOne({ mobile: value });
      if (user) {
        throw createError("Mobile number already in use.");
      }

      return true;
    }),

  body("password")
    .isStrongPassword()
    .withMessage(
      "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one symbol.",
    ),
];

export const addUserValidatorHandler: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const error = validationResult(req);
    const mappedError = error.mapped();

    if (Object.keys(mappedError).length === 0) {
      return next();
    } else {
      res.status(400).json({
        errors: mappedError,
      });
    }
  } catch (error) {
    next(error);
  }
};
