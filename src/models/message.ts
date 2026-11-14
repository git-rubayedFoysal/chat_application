import mongoose, { type InferSchemaType } from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    date_time: {
      type: Date,
      default: Date.now,
    },
    // Stored on every message so a chat's messages can be listed or deleted
    // directly, without first looking up the conversation's participants.
    conversations: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "conversation",
      required: true,
    },
    attachment: [{
      type: String,
    }],
  },
  { timestamps: true },
);

export type MessageType = InferSchemaType<typeof messageSchema>;
const Message = mongoose.model("message", messageSchema);
export default Message;
