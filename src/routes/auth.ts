import express from "express";
import {
  signupUser,
  loginUser,
  changePassword,
  resetPassword,
  validateResetToken,
  verifyEmailToken,
  authenticateUser,
} from "../controllers/auth";
import authChecker from "../middleware/authChecker";

const router = express.Router();

router.post("/signup", signupUser);
router.post("/login", loginUser);
router.post("/change-password", changePassword);
router.post("/reset-password", resetPassword);
router.post("/validate-reset-token", validateResetToken);
router.post("/verify-email", verifyEmailToken);
router.post("/authenticate", authChecker, authenticateUser);

export default router;
