import type { RequestHandler } from "express";
import Conversation from "../models/conversation.js";
import Message from "../models/message.js";
import createError from "http-errors";
import { getIo } from "../socket.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";

export const sendMessage: RequestHandler = async (req, res, next) => {
  const userId = req.user?.id;
  const { message, receiverId, conversationId } = req.body;

  try {
    if (!message?.trim()) {
      throw createError(400, "Message text is required.");
    }

    if (!receiverId || !conversationId) {
      throw createError(400, "Receiver and conversation are required.");
    }

    // Ownership check is inline rather than middleware because this route
    // runs attachmentUpload first; the check still blocks non-participants.
    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [{ creator: userId }, { participant: userId }],
    });

    if (!conversation) {
      throw createError(403, "Access denied");
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    // Upload each attachment to Cloudinary. "auto" lets PDFs/docs use the
    // correct resource type instead of being forced through the image pipeline.
    const uploads = await Promise.all(
      files.map((file) =>
        uploadToCloudinary(
          file.buffer,
          `chat_application/messages/${conversationId}`,
          "auto",
          file.mimetype,
        ),
      ),
    );

    const attachments = uploads.map(
      ({ public_id, secure_url, resource_type }) => {
        if (!public_id || !secure_url) {
          throw createError("Attachment upload failed!");
        }

        // "auto" resolves to a concrete pipeline; normalize anything unexpected
        // to "image" so the stored value matches the schema enum.
        const normalizedType: "image" | "raw" | "video" =
          resource_type === "raw" || resource_type === "video"
            ? resource_type
            : "image";

        return {
          public_id,
          url: secure_url,
          resource_type: normalizedType,
        };
      },
    );

    const newMessage = await Message.create({
      text: message,
      sender: userId,
      receiver: receiverId,
      conversations: conversationId,
      attachment: attachments,
    });

    // Bump last_updated so the conversation rises to the top of the inbox list.
    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { last_updated: new Date() } },
    );

    const populatedMessage = await Message.findById(newMessage._id)
      .populate("sender", "name url")
      .populate("receiver", "name url");

    if (!populatedMessage) {
      throw createError(500, "Failed to retrieve the sent message.");
    }
    // Notify both users in this chat room through the shared Socket.io instance.
    const io = getIo();

    io.to(conversationId).emit("new_message", {
      message: populatedMessage,
      conversationId,
    });

    res.status(201).json({
      message: "Message sent successfully.",
      data: populatedMessage,
    });
  } catch (error) {
    const msg =
      error instanceof Error && error.message
        ? error.message
        : "Failed to send message. Please try again.";

    if (res.headersSent) {
      return next(error);
    }

    res.status(400);
    res.json({
      errors: {
        common: {
          msg,
        },
      },
    });
  }
};
