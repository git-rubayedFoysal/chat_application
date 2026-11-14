import express from "express";
import { getUsers, addUser, removeUser } from "../controllers/user.js";
import { avatarUpload } from "../middlewares/users/avatarUpload.js";
import {
  addUserValidator,
  addUserValidatorHandler,
} from "../middlewares/users/userValidator.js";

const router = express.Router();

router.get("/", getUsers);

// avatarUpload must parse multipart data before validators inspect the body;
// the handler also cleans up the uploaded avatar if validation fails.
router.post(
  "/",
  avatarUpload,
  addUserValidator,
  addUserValidatorHandler,
  addUser,
);

router.delete("/:id", removeUser);

export default router;
