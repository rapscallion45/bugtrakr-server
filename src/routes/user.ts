import express from "express";
import { getAllUsers, getUserById } from "../controllers/user";
import middleware from "../middleware";

const router = express.Router();
const { auth } = middleware;

router.get("/", auth, getAllUsers);
router.get("/:id", auth, getUserById);

export default router;
