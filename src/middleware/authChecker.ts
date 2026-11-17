import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../utils/config";

const authChecker = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header("x-auth-token");

    if (!token) {
      return res
        .status(401)
        .send({ message: "No auth token found. Authorization denied." });
    }

    const decodedToken = jwt.verify(token, JWT_SECRET);

    if (typeof decodedToken === "string" || typeof decodedToken.id !== "string" || !decodedToken.id) {
      return res
        .status(401)
        .send({ message: "Token verification failed. Authorization denied." });
    }

    req.user = decodedToken.id;
    next();
  } catch {
    return res.status(401).send({ message: "Token verification failed. Authorization denied." });
  }
};

export default authChecker;
