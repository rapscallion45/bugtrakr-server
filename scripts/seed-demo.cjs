require("dotenv").config();
const bcrypt = require("bcrypt");
const { connectToDB } = require("../build/db");
const { User } = require("../build/entity/User");
const { Project } = require("../build/entity/Project");
const { Member } = require("../build/entity/Member");
const { Bug } = require("../build/entity/Bug");

async function seed() {
  const db = await connectToDB();
  try {
    await db.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('bugtrakr-demo-seed'))");
      const existing = await manager.findOne(User, { where: { username: "demo" } });
      if (existing && existing.email === "demo@example.invalid") return;
      if (await manager.count(User)) throw new Error("The demo seed requires an empty database.");
      const user = await manager.save(User, {
        username: "demo", email: "demo@example.invalid", firstName: "Demo", lastName: "User",
        verified: true, passwordHash: await bcrypt.hash("password", 10)
      });
      const project = await manager.save(Project, { name: "BugTrakr demo", createdById: user.id });
      await manager.save(Member, { memberId: user.id, projectId: project.id });
      await manager.save(Bug, {
        projectId: project.id, createdById: user.id, title: "Try the bug workflow",
        description: "Edit this sample bug, add a note, then close or reopen it.", priority: "low"
      });
    });
    console.log("Demo account ready.");
  } finally {
    await db.close();
  }
}
seed().catch(() => { console.error("Demo setup failed. Check database access, migrations, and whether this is a fresh database."); process.exitCode = 1; });
