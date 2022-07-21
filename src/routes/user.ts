import express from "express";
import { getAllUsers, getUserById, updateUserById } from "../controllers/user";
import middleware from "../middleware";

const router = express.Router();
const { auth } = middleware;

router.get("/", auth, getAllUsers);
router.get("/:id", auth, getUserById);
router.put("/:id", auth, updateUserById);

export default router;
