// External imports
import express from "express";
import "dotenv/config";
import { connectDB } from "./dbConnection.js";
import { createServer } from "node:http";
import cookieParser from "cookie-parser";
import path from "node:path";

// Internal imports
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler.js";
import { decorateHtmlResponse } from "./middlewares/decorateHtmlResponse.js";
import loginRouter from "./router/login.js";
import userRouter from "./router/user.js";
import inboxRouter from "./router/inbox.js";
import { env } from "./config/env.js";
import { checkAuthentication, requireAuth } from "./middlewares/handleAuth.js";
import { initIo } from "./socket.js";

const app = express();
const server = createServer(app);

initIo(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static(path.join(import.meta.dirname, "../public")));

app.use(cookieParser(env.COOKIE_SECRET));

// Routes
// The login page is public. checkAuthentication only reads a valid session
// when one exists; it does not block visitors, so the form stays reachable.
app.use("/", decorateHtmlResponse("Login"), checkAuthentication, loginRouter);
app.use(
  "/users",
  decorateHtmlResponse("Users"),
  checkAuthentication,
  requireAuth(["admin"]),
  userRouter,
);
app.use(
  "/inbox",
  decorateHtmlResponse("Inbox"),
  checkAuthentication,
  requireAuth(["admin", "user"]),
  inboxRouter,
);

// Fallback handlers for unmatched routes and thrown errors
app.use(notFoundHandler);
app.use(errorHandler);

try {
  await connectDB(env.MONGO_URI);

  server.listen(env.PORT, () => {
    console.log(`Server running on port:${env.PORT}`);
  });
} catch (error) {
  // Stop the process if startup fails; the app cannot work without a database
  // or a listening port.
  console.error("Failed to start application: ", error);
  process.exit(1);
}
