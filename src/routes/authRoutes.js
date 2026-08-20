import express from "express";
import { login, LogOut, register } from "../controller/authController.js";
import { validate } from "../Validators/validate.js";
import { loginSchema, registerSchema } from "../Validators/authValidator.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", LogOut);

export default router;
