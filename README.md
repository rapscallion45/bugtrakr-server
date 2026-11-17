# BugTrakr API

The Express API stores users, projects, membership, bugs, and notes in PostgreSQL using TypeORM. The [hosted API](https://bugtrakr-api.vercel.app/healthz) exposes a readiness check. The [Next.js frontend](https://github.com/rapscallion45/bugtrakr) calls this service on behalf of signed-in users.

## Requests and identity

| Route | Purpose |
| --- | --- |
| `GET /healthz` | Checks a database round trip. Returns 200 when ready and 503 while the database is unavailable. |
| `POST /signup`, `POST /verify-email`, `POST /login` | Register, verify the 24-hour code sent by email, and sign in with a username and password. |
| `POST /login-google`, `POST /login-github` | Verify provider credentials and issue a BugTrakr access token. GitHub links to the stable provider ID. Linking an existing account also requires its current BugTrakr token and a matching verified primary email. |
| `POST /change-password`, `POST /validate-reset-token`, `POST /reset-password` | Request a recovery email, validate the six-digit code, then use it once to set the new password. The code expires after five minutes. |
| `/projects`, `/projects/:projectId/members`, `/projects/:projectId/bugs` | Manage projects, membership, and bugs. Bug routes include notes and close/reopen actions. |
| `/users`, `/users/:id/bugs` | Populate the member directory and the list of bugs reported by a user. |

Protected requests carry the application's signed credential in the `x-auth-token` header. The Next.js server manages this credential. GitHub and Google callback URLs point to the frontend.

## Local development

Use Node 24, npm, and PostgreSQL. Create an empty database and configure these variables in a local `.env` or your shell.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URI. Use a pooled URI for hosted requests. |
| `JWT_SECRET` | Random, persistent signing secret for this API, separate from the frontend's `NEXTAUTH_SECRET`. |
| `PORT` | Local HTTP port, default 3001. |
| `SSL_ENABLED` | Set to `false` for a local PostgreSQL instance without TLS. |
| `GOOGLE_CLIENT_ID` | The frontend Google client's ID, used to validate the ID token audience. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | The GitHub OAuth app used by the frontend. |
| `SMTP_URL`, `MAIL_FROM` | Authenticated SMTP connection URI and verified sender address for registration and recovery. Keep credentials in your environment manager. |

Run these commands from the backend repository. TypeORM's CLI reads the local environment; use the default build configuration for migrations.

```sh
npm ci
npm run build
npm run migrate
npm run seed:demo
npm run dev
```

`seed:demo` is optional and intended for a fresh demo database. It creates the shared demo user, a sample project, its membership, and a sample bug in one transaction. Running it again preserves edits. Every visitor using the frontend's demo button shares those records.

## Hosting on Vercel and Neon

1. Link this directory to its own Vercel project and select Node 24. Provision Neon Free, connect the production environment, and add the API secrets listed above.
2. Build the API locally. Run the migrations against the intended database before serving traffic. For hosted migrations, the migration command uses `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` when available, then falls back to `DATABASE_URL`. Seed only a fresh demo database. Preview and development databases can be provisioned separately.
3. Deploy the repository. Vercel runs `npm run build`. The function at `api/index.js` loads the compiled Express app, including TypeORM decorator metadata. The first request waits for the shared connection pool. Concurrent requests share the pending connection and a failed connection can be retried.
4. Open `/healthz` on the API's stable URL. Configure that origin as `API_REST_URL` in the frontend and redeploy the frontend. Verify credentials sign-in, the project directory, and the sample bug. Use a real recipient to confirm registration and password-reset delivery.

For Resend, verify a sending domain, set `MAIL_FROM` to an address on that domain, and set `SMTP_URL` in the API's Vercel environment to `smtps://resend:<API_KEY>@smtp.resend.com:465` with the real key. Redeploy the API after setting these variables. [Resend SMTP settings](https://resend.com/docs/send-with-smtp)

The web function never runs schema migrations on request. For an existing database, back it up and review pending migrations with `npm run typeorm -- migration:show` before applying them.

Run `npm test`, `npm run lint`, and `npm run build` to check the backend. Authentication tests substitute provider, mail, and persistence dependencies. The live database check is available via `/healthz`.
