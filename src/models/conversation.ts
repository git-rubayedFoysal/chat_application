import mongoose, { type InferSchemaType } from "mongoose";

// A conversation always has exactly two users. Supporting group chat later
// would mean replacing these two fields with a list of participants.
const conversationSchema = new mongoose.Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    // Used to sort the inbox; updated whenever a new message is sent.
    last_updated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

export type ConversationType = InferSchemaType<typeof conversationSchema>;
const Conversation = mongoose.model("conversation", conversationSchema);
export default Conversation;
