import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { User } from "../entity/User";
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

  const passwordSaltRounds = 10;
  const passwordHash = await bcrypt.hash(password, passwordSaltRounds);

  const emailVerificationSaltRounds = 10;
  const emailVerificationCode = Math.floor(100000 + Math.random() * 900000);
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
  await user.save();

  console.log("email verify code:");
  console.log(emailVerificationCode);

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

export const loginWithGoogle = async (req: Request, res: Response) => {
  const { tokenId } = req.body;
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

  const account = await User.findOne({
    where: `"email" ILIKE '${googleUser.email}'`,
  });

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

    const createdAccount = await User.findOne({
      where: `"email" ILIKE '${googleUser.email}'`,
    });

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

export const changePassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  const { errors, valid } = forgotPasswordValidator(email);

  if (!valid) {
    return res.status(400).send({ message: Object.values(errors)[0] });
  }

  const account = await User.findOne({
    where: `"email" ILIKE '${email}'`,
  });

  if (!account) {
    return res.status(401).send({
      message: `Email '${email}' is not registered with us. Please check and try again.`,
    });
  }

  const saltRounds = 10;
  const resetVerificationCode = Math.floor(100000 + Math.random() * 900000);
  const resetVerificationCodeHash = await bcrypt.hash(
    resetVerificationCode.toString(),
    saltRounds
  );

  /* verification code valid for 5 minutes */
  account.resetVerificationCodeHash = resetVerificationCodeHash;
  account.resetVerificationCodeExpires = new Date(
    new Date().getTime() + 5 * 60 * 1000
  );

  console.log("reset password code:");
  console.log(resetVerificationCode);

  await account.save();

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

  const account = await User.findOne({
    where: `"email" ILIKE '${email}'`,
  });

  if (!account) {
    return res.status(401).send({
      message: `Account not found`,
    });
  }

  const tokenValid = await bcrypt.compare(
    resetToken,
    account.resetVerificationCodeHash
  );

  if (!tokenValid) {
    return res.status(401).send({ message: "Invalid reset code." });
  }

  const passwordSaltRounds = 10;
  const passwordHash = await bcrypt.hash(password, passwordSaltRounds);

  account.passwordHash = passwordHash;
  await account.save();

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

  const account = await User.findOne({
    where: `"email" ILIKE '${email}'`,
  });

  if (!account) {
    return res.status(401).send({
      message: `Account not found`,
    });
  }

  const tokenValid = await bcrypt.compare(
    resetToken,
    account.resetVerificationCodeHash
  );

  if (!tokenValid) {
    return res.status(401).send({ message: "Invalid reset code." });
  }

  account.verified = true;
  await account.save();

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

  const account = await User.findOne({
    where: `"email" ILIKE '${email}'`,
  });

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
