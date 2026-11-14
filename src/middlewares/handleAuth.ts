import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import jwt from "jsonwebtoken";
import createError from "http-errors";

// Runs on every HTML request. If the cookie holds a valid token, the user is
// attached to the request; if not, the request continues anyway so public
// pages such as the login form remain reachable.
export const checkAuthentication: RequestHandler = (req, res, next): void => {
  const token = req.signedCookies?.[env.COOKIE_NAME];

  if (!token || typeof token !== "string") {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded === "string") {
      next();
      return;
    }

    req.user = decoded;

    if (res.locals.html) {
      res.locals.loginUser = decoded;
    }

    next();
  } catch {
    next();
  }
};

/**
 * Blocks requests from visitors who are not signed in, or whose role is not
 * allowed. Browsers are redirected or sent to the error page; API clients get
 * a 401 or 403 JSON response.
 *
 * @param roles - Roles allowed through (e.g. ["admin"]).
 * @returns Express middleware that enforces the check.
 */
export const requireAuth = (roles: string[]): RequestHandler => {
  return (req, res, next): void => {
    if (!req.user) {
      if (res.locals.html) {
        res.redirect("/");
      } else {
        res.status(401).json({
          errors: {
            common: {
              msg: "Authentication required to perform this action.",
            },
          },
        });
      }
      return;
    }

    if (!roles.includes(req.user.role)) {
      if (res.locals.html) {
        next(
          createError(403, "You are not authorized to perform this action."),
        );
      } else {
        res.status(403).json({
          errors: {
            common: {
              msg: "You are not authorized to perform this action.",
            },
          },
        });
      }
      return;
    }
    next();
  };
};
