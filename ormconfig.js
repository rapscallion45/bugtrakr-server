const type = process.env.TYPEORM_TYPE || "postgres";
const username = process.env.TYPEORM_USERNAME || "my_user";
const password = process.env.TYPEORM_PASSWORD || "root";
const host = process.env.TYPEORM_HOST || "localhost";
const port = parseInt(process.env.TYPEORM_PORT, 10) || 5432;
const database = process.env.TYPEORM_DATABASE || "bugtrakr";

module.exports = {
  type,
  url:
    process.env.DATABASE_URL ||
    `${type}://${username}:${password}@${host}:${port}/${database}`,
  entities: [
    process.env.NODE_ENV === "test"
      ? "src/entity/**/*.ts"
      : "build/entity/**/*.js",
  ],
  migrations: ["build/migration/**/*.js"],
  cli: {
    entitiesDir:
      process.env.NODE_ENV === "test" ? "src/entity" : "build/entity",
    migrationsDir:
      process.env.NODE_ENV === "test" ? "src/migration" : "build/migration",
  },
  ssl:
    process.env.SSL_ENABLED !== "false" ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: false,
};
