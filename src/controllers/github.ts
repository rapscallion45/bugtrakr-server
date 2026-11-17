import { randomBytes } from "crypto";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getManager } from "typeorm";
import { User } from "../entity/User";
import { JWT_SECRET } from "../utils/config";

interface GitHubIdentity {
  id: string;
  login: string;
  email: string;
}

export async function verifyGitHub(accessToken: string): Promise<GitHubIdentity | null> {
  const id = process.env.GITHUB_CLIENT_ID;
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GitHub OAuth is not configured");
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "BugTrakr" };
  const check = await fetch(
    "https://api.github.com/applications/" + encodeURIComponent(id) + "/token",
    {
      method: "POST",
      headers: {
        ...headers,
        Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: accessToken }),
    }
  );
  if (!check.ok) return null;
  const grant = await check.json();
  if (grant.app?.client_id !== id || !Number.isSafeInteger(grant.user?.id) || !grant.user?.login)
    return null;
  for (let page = 1; ; page += 1) {
    const emails = await fetch("https://api.github.com/user/emails?per_page=100&page=" + page, {
      headers: { ...headers, Authorization: "Bearer " + accessToken },
    });
    if (!emails.ok) return null;
    const addresses = await emails.json();
    const primary = addresses.find((entry: { primary: boolean }) => entry.primary);
    if (primary) {
      if (!primary.verified || typeof primary.email !== "string" || !primary.email) return null;
      return { id: String(grant.user.id), login: grant.user.login, email: primary.email.toLowerCase() };
    }
    if (!emails.headers.get("link")?.includes('rel="next"')) return null;
  }
}

export async function loginWithGitHub(req: Request, res: Response) {
  const { accessToken } = req.body;
  if (typeof accessToken !== "string" || !accessToken)
    return res.status(400).json({ message: "GitHub token required." });
  let linkingUserId: string | undefined;
  const localToken = req.header("x-auth-token");
  if (localToken) {
    try {
      const claims = jwt.verify(localToken, JWT_SECRET);
      if (typeof claims === "string" || typeof claims.id !== "string") throw new Error();
      linkingUserId = claims.id;
    } catch {
      return res.status(401).json({ message: "Sign in to BugTrakr again before linking GitHub." });
    }
  }
  const identity = await verifyGitHub(accessToken);
  if (!identity) return res.status(401).json({ message: "Could not verify your GitHub identity." });
  const account = await getManager().transaction(async (manager) => {
    // Concurrent callbacks for the same account must see the first completed link.
    await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["github:" + identity.id]);
    const users = manager.getRepository(User);
    const linked = await users.findOne({ where: { githubId: identity.id } });
    if (linked) return !linkingUserId || linked.id === linkingUserId ? linked : null;
    await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "github-email:" + identity.email,
    ]);
    const matches = await users
      .createQueryBuilder("u")
      .setLock("pessimistic_write")
      .where("LOWER(u.email) = :email", { email: identity.email })
      .getMany();
    // Legacy accounts can change email without re-verifying it. Email alone
    // cannot authorize linking a new sign-in method to an existing account.
    if (linkingUserId) {
      const local = matches.find((row) => row.id === linkingUserId);
      if (
        matches.length !== 1 ||
        !local ||
        local.githubId ||
        local.username === (process.env.DEMO_LOGIN_USERNAME || "demo")
      )
        return null;
      local.githubId = identity.id;
      return users.save(local);
    }
    if (matches.length) return null;
    const user = users.create({
      githubId: identity.id,
      username: identity.login.slice(0, 7) + "-" + randomBytes(6).toString("hex"),
      email: identity.email,
      passwordHash: "oauth-only",
      verified: true,
      firstName: identity.login,
      lastName: "",
    });
    return users.save(user);
  });
  if (!account)
    return res
      .status(409)
      .json({
        message:
          "Sign in to your existing BugTrakr account and connect GitHub from My Account using the same verified email.",
      });
  const { id, username } = account;
  return res.status(201).json({ id, username, token: jwt.sign({ id, username }, JWT_SECRET) });
}
