import type { RequestHandler } from "express";
import Conversation from "../models/conversation.js";
import User from "../models/user.js";
import { escapeRegex } from "../utils/escapeRegExp.js";
import createError from "http-errors";
import moment from "moment";
import Message from "../models/message.js";
import { getIo } from "../socket.js";

export const getInbox: RequestHandler = async (req, res, next) => {
  try {
    const conversation = await Conversation.find({
      $or: [{ creator: req.user?.id }, { participant: req.user?.id }],
    })
      .populate("creator", "name avatar")
      .populate("participant", "name avatar");

    // Expose data to the template via the project's res.locals convention.
    res.locals.data = conversation;
    res.locals.moment = moment;
    res.render("inbox");
  } catch (error) {
    next(error);
  }
};

export const searchUser: RequestHandler = async (req, res, next) => {
  const user = req.body.user;
  // Remove the country code so a search works with or without "+88".
  const searchQuery = user.replace("+88", "");

  const nameRegex = new RegExp(escapeRegex(searchQuery), "i");
  const mobileRegex = new RegExp(`^${escapeRegex(searchQuery)}`);
  const emailRegex = new RegExp(`^${escapeRegex(searchQuery)}$`, "i");

  try {
    if (searchQuery !== "") {
      const users = await User.find({
        $or: [
          { name: nameRegex },
          { mobile: mobileRegex },
          { email: emailRegex },
        ],
      }).select("name email mobile avatar");

      res.json(users);
    } else {
      throw createError(400, "Search query cannot be empty.");
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to search users. Please try again.";

    // If the response has already started, let the central error handler finish
    // it. Otherwise return the JSON error shape the client expects.
    if (res.headersSent) {
      return next(error);
    }

    res.status(500);
    res.json({
      errors: {
        common: {
          msg: message,
        },
      },
    });
  }
};

export const searchConversation: RequestHandler = async (req, res, next) => {
  const { query } = req.body;
  const userId = req.user?.id;

  try {
    if (!query) {
      throw createError(400, "Search query cannot be empty.");
    }

    // Remove the country code so a search works with or without "+88".
    const cleanQuery = query.replace("+88", "");

    const nameRegex = new RegExp(escapeRegex(cleanQuery), "i");
    const mobileRegex = new RegExp(`^${escapeRegex(cleanQuery)}`);
    const emailRegex = new RegExp(`^${escapeRegex(cleanQuery)}$`, "i");

    const conversations = await Conversation.find({
      $or: [{ creator: userId }, { participant: userId }],
    })
      .populate("creator", "name avatar email mobile")
      .populate("participant", "name avatar email mobile");

    // Match against the *other* participant, since the logged-in user's own
    // details would not identify a conversation in their sidebar.
    const filteredConversations = conversations.filter((conversation) => {
      const creatorId = conversation.creator?._id?.toString();
      const otherUser: any =
        creatorId === userId ? conversation.participant : conversation.creator;

      return (
        mobileRegex.test(otherUser?.mobile) ||
        emailRegex.test(otherUser?.email) ||
        nameRegex.test(otherUser?.name)
      );
    });

    res.json({ data: filteredConversations });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to search conversations. Please try again.";

    if (res.headersSent) {
      return next(error);
    }

    const status = (error as { status?: number })?.status ?? 500;
    res.status(status);
    res.json({
      errors: {
        common: {
          msg: message,
        },
      },
    });
  }
};

/**
 * Creates a 1-on-1 conversation or returns the existing one. Lookups check
 * both directions (A→B and B→A) so a reversed pair is not duplicated.
 */
export const addConversation: RequestHandler = async (req, res, next) => {
  const { id } = req.body;
  const userId = req.user?.id;

  try {
    if (!id) {
      throw createError(400, "Participant ID is required.");
    }

    // Prevent creating conversation with yourself
    if (id === userId) {
      throw createError(400, "Cannot create conversation with yourself.");
    }

    // Check if conversation already exists between these two users
    const existing = await Conversation.findOne({
      $or: [
        { creator: userId, participant: id },
        { creator: id, participant: userId },
      ],
    });

    if (existing) {
      return res.status(200).json({
        message: "Conversation already exists.",
        existing: true,
        conversationId: String(existing._id),
      });
    }

    const conversation = await Conversation.create({
      creator: userId,
      participant: id,
    });

    return res.status(201).json({
      message: "Conversation created successfully.",
      existing: false,
      conversationId: String(conversation._id),
    });
  } catch (error) {
    const msg =
      error instanceof Error && error.message
        ? error.message
        : "Failed to create conversation. Please try again.";

    if (res.headersSent) {
      return next(error);
    }

    const status = (error as { status?: number })?.status ?? 500;
    res.status(status);
    res.json({
      errors: {
        common: {
          msg,
        },
      },
    });
  }
};

export const getMessages: RequestHandler = async (req, res, next) => {
  const { conversationId } = req.params;
  const userId = req.user?.id;

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [{ creator: userId }, { participant: userId }],
    })
      .populate("creator", "name avatar")
      .populate("participant", "name avatar");

    if (!conversation) {
      throw createError(403, "Access denied");
    }

    // Determine the "other user" so the client knows who it is chatting with.
    const participant =
      conversation.creator._id.toString() === userId
        ? conversation.participant
        : conversation.creator;

    const messages = await Message.find({
      conversations: conversationId,
    } as any)
      .populate("sender", "name avatar")
      .sort({ createdAt: -1 });

    res.json({
      data: {
        messages,
        participant,
      },
      user: userId,
      conversationId,
    });
  } catch (error) {
    const msg =
      error instanceof Error && error.message
        ? error.message
        : "Failed to fetch messages. Please try again.";

    if (res.headersSent) {
      return next(error);
    }

    res.status(500);
    res.json({
      errors: {
        common: {
          msg,
        },
      },
    });
  }
};

/**
 * Deletes a conversation and its messages, then broadcasts the removal so
 * clients with the chat closed also drop their stale sidebar entry.
 */
export const deleteConversation: RequestHandler = async (req, res, next) => {
  const { conversationId } = req.params;
  const userId = req.user?.id;

  try {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [{ creator: userId }, { participant: userId }],
    });

    if (!conversation) {
      throw createError(403, "Access denied");
    }

    await Conversation.deleteOne({ _id: conversationId });
    await Message.deleteMany({ conversations: conversationId } as any);

    getIo().emit("conversation_deleted", {
      conversationId,
    });

    res.json({
      message: "Conversation deleted successfully.",
    });
  } catch (error) {
    const msg =
      error instanceof Error && error.message
        ? error.message
        : "Failed to delete conversation. Please try again.";

    if (res.headersSent) {
      return next(error);
    }

    res.status(500);
    res.json({
      errors: {
        common: {
          msg,
        },
      },
    });
  }
};
