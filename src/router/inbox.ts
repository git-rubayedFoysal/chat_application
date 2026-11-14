import express from "express";
import {
  getInbox,
  searchUser,
  addConversation,
  getMessages,
  deleteConversation,
  searchConversation,
} from "../controllers/inbox.js";
import { sendMessage } from "../controllers/sendMessage.js";
import { attachmentUpload } from "../middlewares/chat/attachmentUpload.js";
import { conversationParticipant } from "../middlewares/chat/conversationAuth.js";

const router = express.Router();

router.get("/", getInbox);
router.post("/search", searchUser);
router.post("/conversation", addConversation);

// conversationParticipant runs before the controller so non-participants are
// rejected before any message data is read or deleted.
router.get("/messages/:conversationId", conversationParticipant, getMessages);
router.delete(
  "/conversation/:conversationId",
  conversationParticipant,
  deleteConversation,
);

// attachmentUpload must parse multipart data before sendMessage reads req.files.
router.post("/message", attachmentUpload, sendMessage);
router.post("/search-conversation", searchConversation);

export default router;
