import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { User } from "../entity/User";
import { randomInt } from "crypto";
import { sendRecoveryCode, sendVerificationCode } from "../utils/mail";
import { getManager, Raw } from "typeorm";
import jwt from "jsonwebtoken";
import generator from "generate-password";
import bcrypt from "bcrypt";
import { JWT_SECRET } from "../utils/config";
import {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  tokenValidator,
  googleIdTokenValidator,
} from "../utils/validators";

export const signupUser = async (req: Request, res: Response) => {
  const { username, password, email, firstName, lastName } = req.body;
  const { errors, valid } = registerValidator(username, password);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const existingUser = await User.findOne({
    where: { username: Raw(alias => `LOWER(${alias}) = LOWER(:username)`, { username }) },
  });

  if (existingUser) {
    return res
      .status(401)
      .send({ message: `Username '${username}' is already taken.` });
  }

  const existingEmail = await findAccountByEmail(email);

  if (existingEmail) {
    return res
      .status(401)
      .send({ message: `Email '${email}' is already registered with us.` });
  }

  const passwordSaltRounds = 10;
  const passwordHash = await bcrypt.hash(password, passwordSaltRounds);

  const emailVerificationSaltRounds = 10;
  const emailVerificationCode = randomInt(100000, 1000000);
  const emailVerificationCodeHash = await bcrypt.hash(
    emailVerificationCode.toString(),
    emailVerificationSaltRounds
  );

  const user = User.create({
    username,
    passwordHash,
    email,
    firstName,
    lastName,
    verified: false,
    emailVerificationCodeHash,
    emailVerificationCodeExpires: new Date(
      new Date().getTime() + 24 * 60 * 60 * 1000
    ),
  });
  await getManager().transaction(async (manager) => {
    await manager.save(user);
    await sendVerificationCode(user.email, String(emailVerificationCode));
  });

  return res.status(201).json({
    message:
      "An account verification code has been sent to the email you registered with us. This may take a few moments. Please keep refreshing your inbox.",
    email,
  });
};

export const loginUser = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const { errors, valid } = loginValidator(username, password);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const user = await User.findOne({
    where: { username: Raw(alias => `LOWER(${alias}) = LOWER(:username)`, { username }) },
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

export const loginWithGoogle = async (req: Request, res: Response) => {
  const { tokenId } = req.body;
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ message: "Google sign-in is not configured." });
  const client = new OAuth2Client();
  const { errors, valid } = await googleIdTokenValidator(tokenId);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  /* verify the token is a genuine token from Google using OAuth2 lib */
  async function verify(idToken: string) {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
  }
  const googleUser = await verify(tokenId).catch(console.error);

  if (!googleUser || !googleUser.email || !googleUser.email_verified) {
    return res.status(401).send({
      message: `We could not verify your Google account.`,
    });
  }

  const account = await findAccountByEmail(googleUser.email);

  /* check for existing user */
  if (!account) {
    /* no user found, therefore create new account, auto generating fields */
    const passwordSaltRounds = 10;
    const passwordHash = await bcrypt.hash(
      generator.generate({
        length: 10,
        numbers: true,
      }),
      passwordSaltRounds
    );
    const user = User.create({
      username:
        (googleUser.given_name?.toLowerCase() ||
          generator.generate({
            length: 10,
            numbers: false,
          })) + Math.floor(10000 + Math.random() * 90000),
      email: googleUser.email,
      passwordHash,
      firstName: googleUser.given_name || "user",
      lastName: googleUser.family_name || "",
      verified: true,
    });
    await user.save();

    const createdAccount = await findAccountByEmail(googleUser.email);

    /* error check to make sure user has been saved successfully */
    if (createdAccount) {
      /* log new user in */
      const token = jwt.sign(
        { id: createdAccount.id, username: createdAccount.username },
        JWT_SECRET
      );
      return res.status(201).json({
        id: createdAccount.id,
        username: createdAccount.username,
        token,
      });
    }
    return res.status(401).send({
      message: `There was an error creating your account.`,
    });
  }

  /* existing user found, log the user in */
  const token = jwt.sign(
    { id: account.id, username: account.username },
    JWT_SECRET
  );
  return res.status(201).json({
    id: account.id,
    username: account.username,
    token,
  });
};

export const authenticateUser = async (req: Request, res: Response) => {
  const { user } = req;

  const userData = await User.findOne({
    where: { id: user },
  });

  if (!userData) {
    return res.status(401).send({
      message: `User not found.`,
    });
  }

  const token = jwt.sign(
    { id: userData.id, username: userData.username },
    JWT_SECRET
  );
  return res.status(201).json({
    id: userData.id,
    username: userData.username,
    token,
  });
};

function findAccountByEmail(email: string) {
  return User.findOne({
    where: { email: Raw(alias => `LOWER(${alias}) = LOWER(:email)`, { email }) },
  });
}

async function validRecoveryCode(account: User, code: string) {
  return Boolean(account.resetVerificationCodeHash && account.resetVerificationCodeExpires &&
    account.resetVerificationCodeExpires > new Date() &&
    await bcrypt.compare(code, account.resetVerificationCodeHash));
}

export const changePassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  const { errors, valid } = forgotPasswordValidator(email);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const account = await findAccountByEmail(email);

  if (!account) {
    return res.status(401).send({
      message: `Email '${email}' is not registered with us. Please check and try again.`,
    });
  }

  if (account.username === (process.env.DEMO_LOGIN_USERNAME || "demo")) {
    return res.status(403).json({ message: "Password recovery is disabled for the demo account." });
  }

  const saltRounds = 10;
  const resetVerificationCode = randomInt(100000, 1000000);
  const resetVerificationCodeHash = await bcrypt.hash(
    resetVerificationCode.toString(),
    saltRounds
  );

  /* verification code valid for 5 minutes */
  account.resetVerificationCodeHash = resetVerificationCodeHash;
  account.resetVerificationCodeExpires = new Date(
    new Date().getTime() + 5 * 60 * 1000
  );

  await account.save();
  await sendRecoveryCode(account.email, String(resetVerificationCode));

  return res.status(201).json({
    message: `A password reset verification code has been sent to '${email}'.`,
    email,
  });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { resetToken, password, email } = req.body;
  const { errors, valid } = resetPasswordValidator(resetToken, password, email);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const account = await findAccountByEmail(email);

  if (!account) {
    return res.status(401).send({
      message: `Account not found`,
    });
  }

  if (account.username === (process.env.DEMO_LOGIN_USERNAME || "demo")) {
    return res.status(403).json({ message: "Password recovery is disabled for the demo account." });
  }

  if (!(await validRecoveryCode(account, resetToken))) {
    return res.status(401).send({ message: "Invalid reset code." });
  }

  const passwordSaltRounds = 10;
  const passwordHash = await bcrypt.hash(password, passwordSaltRounds);

  const updated = await User.createQueryBuilder().update().set({
    passwordHash, resetVerificationCodeHash: null, resetVerificationCodeExpires: null,
  }).where("id = :id", { id: account.id })
    .andWhere('"resetVerificationCodeHash" = :hash', { hash: account.resetVerificationCodeHash })
    .andWhere('"resetVerificationCodeExpires" > CURRENT_TIMESTAMP').execute();
  if (!updated.affected) return res.status(401).json({ message: "Reset code expired or invalid." });

  return res.status(200).json({
    message: `Password updated successfully.`,
  });
};

export const validateResetToken = async (req: Request, res: Response) => {
  const { resetToken, email } = req.body;
  const { errors, valid } = tokenValidator(resetToken, email);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const account = await findAccountByEmail(email);

  if (!account) {
    return res.status(401).send({
      message: `Account not found`,
    });
  }

  if (account.username === (process.env.DEMO_LOGIN_USERNAME || "demo")) {
    return res.status(403).json({ message: "Password recovery is disabled for the demo account." });
  }

  if (!(await validRecoveryCode(account, resetToken))) {
    return res.status(401).send({ message: "Invalid reset code." });
  }

  if (!account.verified) await User.update(account.id, { verified: true });

  return res.status(200).json({
    message: `Token valid.`,
  });
};

export const verifyEmailToken = async (req: Request, res: Response) => {
  const { token, email } = req.body;
  const { errors, valid } = tokenValidator(token, email);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const account = await findAccountByEmail(email);

  if (!account) {
    return res.status(401).send({
      message: `Account not found.`,
    });
  }

  if (account.verified) {
    return res.status(400).send({
      message: `This account has already been verified.`,
    });
  }

  if (!account.emailVerificationCodeExpires || account.emailVerificationCodeExpires <= new Date()) {
    return res.status(400).send({ message: "Verification code expired. Recover your account using Forgot Password." });
  }

  const tokenValid = await bcrypt.compare(
    token,
    account.emailVerificationCodeHash
  );

  if (!tokenValid) {
    return res.status(401).send({ message: "Invalid verification code." });
  }

  account.verified = true;
  await account.save();

  return res.status(200).json({
    message: `Your account has been verified! You can now login!`,
  });
};
