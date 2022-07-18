import express from "express";
import { getBugsByUser } from "../controllers/bug";
import middleware from "../middleware";

const router = express.Router();
const { auth } = middleware;

router.get("/:userId/bugs", auth, getBugsByUser);

export default router;
