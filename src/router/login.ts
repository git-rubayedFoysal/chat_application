import express from "express";
import { getLogin, login, logout } from "../controllers/login.js";
import {
  loginValidator,
  loginValidatorHandler,
} from "../middlewares/login/loginValidator.js";

const router = express.Router();

router.get("/", getLogin);

// Validation runs before the controller so invalid input never reaches auth.
router.post("/", loginValidator, loginValidatorHandler, login);

router.delete("/", logout);

export default router;
