import { Request, Response } from "express";
import { User } from "../entity/User";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { JWT_SECRET } from "../utils/config";
import { registerValidator, loginValidator } from "../utils/validators";

export const signupUser = async (req: Request, res: Response) => {
  const { username, password, email, firstName, lastName } = req.body;
  const { errors, valid } = registerValidator(username, password);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const existingUser = await User.findOne({
    where: `"username" ILIKE '${username}'`,
  });

  if (existingUser) {
    return res
      .status(401)
      .send({ message: `Username '${username}' is already taken.` });
  }

  const existingEmail = await User.findOne({
    where: `"email" ILIKE '${email}'`,
  });

  if (existingEmail) {
    return res
      .status(401)
      .send({ message: `Email '${email}' is already registered with us.` });
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const user = User.create({
    username,
    passwordHash,
    email,
    firstName,
    lastName,
  });
  await user.save();

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
    },
    JWT_SECRET
  );

  return res.status(201).json({
    id: user.id,
    username: user.username,
    token,
  });
};

export const loginUser = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const { errors, valid } = loginValidator(username, password);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const user = await User.findOne({
    where: `"username" ILIKE '${username}'`,
  });

  if (!user) {
    return res.status(401).send({
      message: `We cannot find a username or email matching '${username}'. Please check and try again.`,
    });
  }

  const credentialsValid = await bcrypt.compare(password, user.passwordHash);

  if (!credentialsValid) {
    return res
      .status(401)
      .send({ message: "Login failed, please check your credentials." });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
  return res.status(201).json({
    id: user.id,
    username: user.username,
    token,
  });
};
