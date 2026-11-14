import type { RequestHandler } from "express";
import Conversation from "../../models/conversation.js";
import createError from "http-errors";

/**
 * Checks that the signed-in user belongs to the conversation in
 * `:conversationId`, then stores it on `req.conversation` for the controller.
 * Outsiders get a 403 and cannot tell whether the conversation exists.
 * Must run after `requireAuth`.
 */
export const conversationParticipant: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
  const { conversationId } = req.params;
  const userId = req.user?.id;

  if (!conversationId) {
    next(createError(400, "Conversation ID is required."));
    return;
  }

  if (!userId) {
    if (res.locals.html) {
      res.redirect("/");
    } else {
      res.status(401).json({
        errors: {
          common: { msg: "Authentication required." },
        },
      });
    }
    return;
  }

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [{ creator: userId }, { participant: userId }],
    }).select("_id creator participant last_updated");

    if (!conversation) {
      if (res.locals.html) {
        next(
          createError(403, "You are not a participant of this conversation."),
        );
      } else {
        res.status(403).json({
          errors: {
            common: {
              msg: "You are not authorized to access this conversation.",
            },
          },
        });
      }
      return;
    }

    (req as any).conversation = conversation;

    next();
  } catch (error) {
    // A malformed ObjectId surfaces as a CastError; treat it as a client error
    // rather than a server fault.
    const status =
      error instanceof Error && error.name === "CastError" ? 400 : 500;

    if (res.headersSent) {
      return next(error);
    }

    res.status(status).json({
      errors: {
        common: {
          msg:
            status === 400
              ? "Invalid conversation ID format."
              : "Failed to verify conversation access. Please try again.",
        },
      },
    });
  }
};
