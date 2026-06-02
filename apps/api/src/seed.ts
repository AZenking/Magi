import "reflect-metadata";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword } from "better-auth/crypto";
import { username } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { createLogger } from "@magi/utils";
import { db } from "./infrastructure/database/connection";
import * as schema from "./infrastructure/database/schema";

const logger = createLogger({ context: "seed" });

// Separate auth instance for seeding — no disableSignUp so admin can be created.
const seedAuth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 256,
  },
  plugins: [username()],
  secret: process.env.BETTER_AUTH_SECRET ?? "seed-secret",
});

async function seed() {
  const adminUsername = process.env.MAGI_ADMIN_USERNAME;
  const adminPassword = process.env.MAGI_ADMIN_PASSWORD;
  const adminEmail = process.env.MAGI_ADMIN_EMAIL;
  const adminName = process.env.MAGI_ADMIN_NAME;

  if (!adminUsername || !adminPassword || !adminEmail || !adminName) {
    logger.error(
      "Missing required env vars: MAGI_ADMIN_USERNAME, MAGI_ADMIN_PASSWORD, MAGI_ADMIN_EMAIL, MAGI_ADMIN_NAME",
    );
    process.exit(1);
  }

  const existingAdmin = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.username, adminUsername))
    .limit(1);

  const [admin] = existingAdmin;

  if (admin) {
    const adminId = admin.id;
    const passwordHash = await hashPassword(adminPassword);

    await db
      .update(schema.user)
      .set({
        email: adminEmail,
        name: adminName,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, adminId));

    await db
      .update(schema.account)
      .set({
        accountId: adminEmail,
        password: passwordHash,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.account.userId, adminId),
          eq(schema.account.providerId, "credential"),
        ),
      );

    logger.info(`Admin user "${adminUsername}" synchronized successfully.`);
    process.exit(0);
  }

  await seedAuth.api.signUpEmail({
    body: {
      username: adminUsername,
      password: adminPassword,
      email: adminEmail,
      name: adminName,
    },
  });

  logger.info(`Admin user "${adminUsername}" created successfully.`);
  process.exit(0);
}

seed().catch((err) => {
  logger.error("Seed failed:", { error: (err as Error).message });
  process.exit(1);
});
