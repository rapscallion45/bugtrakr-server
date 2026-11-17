const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { getConnectionManager } = require("typeorm");
process.env.JWT_SECRET = "local-test-only";
process.env.GITHUB_CLIENT_ID = "client";
process.env.GITHUB_CLIENT_SECRET = "secret";
const { loginWithGitHub } = require("../src/controllers/github");
const { signupUser, verifyEmailToken, loginWithGoogle, changePassword, validateResetToken, resetPassword } = require("../src/controllers/auth");
const { User } = require("../src/entity/User");
const mail = require("../src/utils/mail");

function response() {
  return {
    status(code) {
      this.code = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
    send(data) {
      return this.json(data);
    },
  };
}
function github(t, verified = true, valid = true, paginated = false) {
  return t.mock.method(global, "fetch", async (url, options) => {
    if (url.endsWith("/applications/client/token")) {
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).access_token, "proof");
      assert.equal(
        options.headers.Authorization,
        "Basic " + Buffer.from("client:secret").toString("base64")
      );
      return {
        ok: valid,
        json: async () => ({ app: { client_id: "client" }, user: { id: 51, login: "example" } }),
      };
    }
    assert.match(url, /api\.github\.com\/user\/emails/);
    assert.equal(options.headers.Authorization, "Bearer proof");
    if (paginated && new URL(url).searchParams.get("page") === "1") {
      return { ok: true, headers: new Headers({ Link: '<https://api.github.com/user/emails?page=2>; rel="next"' }), json: async () => [] };
    }
    return {
      ok: true,
      json: async () => [{ email: "user@example.test", verified, primary: true }],
    };
  });
}
const connection = getConnectionManager().create({ type: "postgres", entities: [User] });
function database(t, existing = []) {
  const rows = existing;
  const builder = {
    setLock() {
      return this;
    },
    where() {
      return this;
    },
    async getMany() {
      return rows;
    },
  };
  const repo = {
    findOne: async ({ where }) => rows.find((user) => user.githubId === where.githubId),
    createQueryBuilder: () => builder,
    create: (fields) => ({ ...fields, id: "local-id" }),
    save: async (user) => {
      if (!rows.includes(user)) rows.push(user);
      return user;
    },
  };
  t.mock.method(connection.manager, "transaction", async (callback) =>
    callback({ query: async () => [], getRepository: () => repo })
  );
  return rows;
}
test("GitHub exchange creates a local user and reuses the stable identity on repeat sign-in", async (t) => {
  github(t);
  const rows = database(t);
  for (let i = 0; i < 2; i += 1) {
    const res = response();
    await loginWithGitHub({ header: () => undefined, body: { accessToken: "proof" } }, res);
    assert.equal(res.code, 201);
    assert.equal(jwt.verify(res.data.token, process.env.JWT_SECRET).id, "local-id");
    assert.equal(res.data.id, "local-id");
  }
  assert.equal(rows.length, 1);
  assert.equal(rows[0].githubId, "51");
});
test("uses the verified primary GitHub email from a later page", async (t) => {
  const calls = github(t, true, true, true);
  database(t);
  const res = response();
  await loginWithGitHub({ header: () => undefined, body: { accessToken: "proof" } }, res);
  assert.equal(res.code, 201);
  assert.equal(calls.mock.callCount(), 3);
});
test("rejects an invalid app token before creating a user", async (t) => {
  const calls = github(t, true, false);
  const res = response();
  await loginWithGitHub({ header: () => undefined, body: { accessToken: "proof" } }, res);
  assert.equal(res.code, 401);
  assert.equal(calls.mock.callCount(), 1);
});
test("links an existing account only with its own valid BugTrakr credential", async (t) => {
  github(t);
  const rows = database(t, [{ id: "local-id", email: "user@example.test", username: "member" }]);
  const localToken = jwt.sign({ id: "local-id" }, process.env.JWT_SECRET);
  const res = response();
  await loginWithGitHub({ header: () => localToken, body: { accessToken: "proof" } }, res);
  assert.equal(res.code, 201);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].githubId, "51");
});
test("requires a verified primary email", async (t) => {
  github(t, false);
  const res = response();
  await loginWithGitHub({ header: () => undefined, body: { accessToken: "proof" } }, res);
  assert.equal(res.code, 401);
});
test("an existing local email requires a separate proof of account ownership", async (t) => {
  github(t);
  database(t, [{ id: "legacy", email: "user@example.test", verified: true }]);
  const res = response();
  await loginWithGitHub({ header: () => undefined, body: { accessToken: "proof" } }, res);
  assert.equal(res.code, 409);
});
test("the recovery target determines demo restrictions at every stage", async (t) => {
  t.mock.method(User, "findOne", async () => ({ username: "demo" }));
  for (const handler of [changePassword, validateResetToken, resetPassword]) {
    const res = response();
    await handler(
      { body: { email: "demo@example.test", resetToken: "123456", password: "new-password" } },
      res
    );
    assert.equal(res.code, 403);
  }
});
test("recovery sends a usable code to the stored email and consumes it once", async (t) => {
  const account = {
    id: "1",
    username: "member",
    email: "member@example.test",
    verified: true,
    save: async () => {},
  };
  t.mock.method(User, "findOne", async () => account);
  let sentCode;
  t.mock.method(mail, "sendRecoveryCode", async (email, code) => {
    assert.equal(email, account.email);
    sentCode = code;
  });
  const issue = response();
  await changePassword({ body: { email: account.email } }, issue);
  assert.equal(issue.code, 201);
  assert.match(sentCode, /^\d{6}$/);
  assert.ok(await bcrypt.compare(sentCode, account.resetVerificationCodeHash));
  const body = { email: account.email, resetToken: sentCode, password: "new-password" };
  const validate = response();
  await validateResetToken({ body }, validate);
  assert.equal(validate.code, 200);
  const update = {
    update() {
      return this;
    },
    set(fields) {
      this.fields = fields;
      return this;
    },
    where() {
      return this;
    },
    andWhere() {
      return this;
    },
    async execute() {
      Object.assign(account, this.fields);
      return { affected: 1 };
    },
  };
  t.mock.method(User, "createQueryBuilder", () => update);
  const reset = response();
  await resetPassword({ body }, reset);
  assert.equal(reset.code, 200);
  assert.ok(await bcrypt.compare(body.password, account.passwordHash));
  const replay = response();
  await resetPassword({ body }, replay);
  assert.equal(replay.code, 401);
});

test("Google sign-in verifies the configured audience and returns the local account credential", async t => {
  process.env.GOOGLE_CLIENT_ID = "google-client";
  const { OAuth2Client } = require("google-auth-library");
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async options => {
    assert.deepEqual(options, {idToken: "google-proof", audience: "google-client"});
    return { getPayload: () => ({email_verified: true, email: "member@example.test"}) };
  });
  t.mock.method(User, "findOne", async () => ({id: "local-google", username: "member"}));
  const res = response();
  await loginWithGoogle({body: {tokenId: "google-proof"}}, res);
  assert.equal(res.code, 201);
  assert.equal(jwt.verify(res.data.token, process.env.JWT_SECRET).id, "local-google");
});

test("protected routes reject expired tokens and accept current BugTrakr credentials", () => {
  const authChecker = require("../src/middleware/authChecker").default;
  const expired = jwt.sign({ id: "member" }, process.env.JWT_SECRET, { expiresIn: -1 });
  const denied = response();
  authChecker({ header: () => expired }, denied, () => assert.fail("expired credential accepted"));
  assert.equal(denied.code, 401);
  const req = { header: () => jwt.sign({ id: "member" }, process.env.JWT_SECRET) };
  let called = false;
  authChecker(req, response(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user, "member");
});

test("registration emails the code used by the verification endpoint", async (t) => {
  let account, code;
  t.mock.method(User, "findOne", async () => account);
  t.mock.method(User, "create", (data) => ({ ...data, save: async () => {} }));
  t.mock.method(connection.manager, "transaction", async (callback) => callback({ save: async (data) => { account = data; } }));
  t.mock.method(mail, "sendVerificationCode", async (email, value) => {
    assert.equal(email, "new@example.test");
    code = value;
  });
  const signup = response();
  await signupUser({ body: { username: "new-user", password: "test-secret", email: "new@example.test", firstName: "New", lastName: "User" } }, signup);
  assert.equal(signup.code, 201);
  assert.match(code, /^\d{6}$/);
  const verification = response();
  await verifyEmailToken({ body: { token: code, email: account.email } }, verification);
  assert.equal(verification.code, 200);
  assert.equal(account.verified, true);
});
