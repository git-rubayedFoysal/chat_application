import type { RequestHandler } from "express";

/**
 * Fills res.locals with the values every HTML page expects. The `html` flag
 * tells auth and error middleware to send an HTML page instead of JSON.
 *
 * @param page_title - Label used to build the page title.
 * @returns Middleware that sets the shared template values.
 */
export const decorateHtmlResponse = (page_title: string): RequestHandler => {
  return (_req, res, next) => {
    res.locals.html = true;
    res.locals.title = `${page_title} - Chat Application`;
    res.locals.loginUser = {};
    res.locals.errors = {};
    res.locals.data = {};
    next();
  };
};
