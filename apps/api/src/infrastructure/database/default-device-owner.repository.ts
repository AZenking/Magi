import { eq } from "drizzle-orm";
import type { DefaultDeviceOwnerRepository as DefaultDeviceOwnerRepositoryPort } from "@/domain/device-client";
import { db } from "./connection";
import { user } from "./schema";

/** Resolves the configured account that owns automatically registered TVs. */
export class DefaultDeviceOwnerRepository
  implements DefaultDeviceOwnerRepositoryPort
{
  async findByUsername(username: string): Promise<{ id: string } | null> {
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, username))
      .limit(1);
    return row ?? null;
  }
}
