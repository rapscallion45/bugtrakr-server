require("dotenv").config();
require("reflect-metadata");
const { createConnection } = require("typeorm");

async function migrate() {
  const options = require("../ormconfig");
  const directUrl = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
  const db = await createConnection({ ...options, url: directUrl || options.url });
  try {
    const applied = await db.runMigrations();
    console.log(applied.length ? "Applied migrations: " + applied.map(item => item.name).join(", ") : "Database migrations are current.");
  } finally {
    await db.close();
  }
}
migrate().catch(error => { console.error("Migration failed:", error.code || error.name); process.exitCode = 1; });
