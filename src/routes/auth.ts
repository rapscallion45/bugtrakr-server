import express from "express";
import { signupUser, loginUser, authenticateUser } from "../controllers/auth";
import authChecker from "../middleware/authChecker";

const router = express.Router();

router.post("/signup", signupUser);
router.post("/login", loginUser);
router.post("/authenticate", authChecker, authenticateUser);

export default router;
