import { Request, Response } from "express";
import { User } from "../entity/User";
import { Not } from "typeorm";

export const getAllUsers = async (req: Request, res: Response) => {
  const users = await User.find({
    where: { id: Not(req.userId) },
    select: ["id", "username"],
  });

  res.json(users);
};

export const getUserById = async (req: Request, res: Response) => {
  const user = await User.findOne({
    where: { id: req.params.id },
    select: ["id", "username", "email", "firstName", "lastName"],
  });

  res.json(user);
};
