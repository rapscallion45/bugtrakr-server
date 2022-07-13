# BugTrakr | Postgres-TypeScript Server

Bug tracking app backend made with Postgres + Express + TS

## Demo

[Deployed on Vercel (front-end) & Heroku (back-end)](https://bugtrakr.vercel.app)

## Server built using

- [Node.js](https://nodejs.org/en/) - Runtime environment for JS
- [Express.js](https://expressjs.com/) - Node.js framework, makes process of building APIs easier & faster
- [PostgreSQL](https://www.postgresql.org/) - Opens-source SQL database to store data
- [TypeORM](https://typeorm.io/) - TS-based ORM for mostly SQL-based databases
- [JSON Web Token](https://jwt.io/) - A standard to secure/authenticate HTTP requests
- [Bcrypt.js](https://www.npmjs.com/package/bcryptjs) - For hashing passwords
- [Dotenv](https://www.npmjs.com/package/dotenv) - To load environment variables from a .env file

## Server features

- Authentication (login/register w/ username & password)
- CRUD projects, with ability to add members for group work
- CRUD bugs, with title, description & priority
- Project members can add, edit, close & reopen bugs etc.
- CRUD notes, for guiding other members of what bug is/how to reproduce/solution

## Usage

#### Env variable:

Create a .env file in server directory and add the following:

```
PORT = 3005
JWT_SECRET = "Your JWT secret"

```

#### Server:

Open ormconfig.js & update the local PostgreSQL credentials to match with yours.

To run the migarations, go to server dir & run this command:
`npm run typeorm migration:run`

Run backend development server:

```
cd server
npm install
npm run dev
```
