import { Request, Response } from "express";
import { User } from "../entity/User";
import { Not } from "typeorm";

export const getAllUsers = async (req: Request, res: Response) => {
  const users = await User.find({
    where: { id: Not(req.user) },
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

export const updateUserById = async (req: Request, res: Response) => {
  const { firstName, lastName, email } = req.body;
  const { id } = req.params;

  if (!id) {
    return res.status(400).send({ message: "No account ID supplied." });
  }

  if (id !== req.user) {
    return res
      .status(401)
      .send({ message: "You are not authorized to perform this operation." });
  }

  const account = await User.findOne({ id });

  if (!account) {
    return res.status(401).send({ message: "Account not found." });
  }

  account.firstName = firstName ?? account.firstName;
  account.lastName = lastName ?? account.lastName;
  account.email = email ?? account.email;
  account.updatedAt = new Date();

  await account.save();

  return res.status(201).json(account);
};
