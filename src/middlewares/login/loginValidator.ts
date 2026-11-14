import type { RequestHandler } from "express";
import { body, validationResult } from "express-validator";

export const loginValidator = [
  body("username")
    .isLength({ min: 1 })
    .withMessage("Mobile number or email is required."),
  body("password").isLength({ min: 1 }).withMessage("Password is required."),
];

export const loginValidatorHandler: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  const mappedError = errors.mapped();

  if (Object.keys(mappedError).length !== 0) {
    return res.render("index", {
      data: { username: req.body.username },
      errors: mappedError,
    });
  }

  return next();
};
