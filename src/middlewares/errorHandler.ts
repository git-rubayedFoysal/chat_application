import createError from "http-errors";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { env } from "../config/env.js";

// Turns any unmatched route into a 404 error for the handler below.
export const notFoundHandler: RequestHandler = (_req, _res, next): void => {
  next(createError(404, "Requested content was not found."));
};

// Sends the final error response as either an HTML page or JSON.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || 500;

  // Stack traces and internal messages leak in development but are masked in
  // production, where clients only see a generic message.
  res.locals.error =
    env.NODE_ENV === "development" ? err : "Internal Server Error";

  res.status(statusCode);

  if (res.locals.html) {
    res.render("error", {
      title: "Error Page",
    });
  } else {
    res.json({
      success: false,
      error: res.locals.error,
    });
  }
};
