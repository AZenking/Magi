import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { auth } from "../../infrastructure/auth/auth.config";
import { db } from "../../infrastructure/database/connection";
import { user } from "../../infrastructure/database/schema";

/**
 * Authentication is deliberately separate from authorization.  Account
 * routes use AuthGuard; global administration routes use this guard so an
 * authenticated normal user cannot manage every tenant's credentials.
 *
 * `role` is the durable source of truth.  The explicit env allow-list is a
 * bootstrap escape hatch for installations upgrading before the role
 * migration/seed has run, and is intentionally opt-in through the existing
 * MAGI_ADMIN_USERNAME(S) settings.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) throw new UnauthorizedException("未登录或会话已过期");

    const sessionUser = session.user as {
      id: string;
      username?: string | null;
      role?: string | null;
    };
    let role: string | null | undefined = sessionUser.role;
    try {
      const [row] = await db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, sessionUser.id))
        .limit(1);
      role = row?.role ?? role;
    } catch {
      // The allow-list below lets an already deployed admin recover while a
      // rolling deployment is applying 0010. It never grants access to an
      // unknown username.
    }

    const configuredIds = splitEnv(process.env.MAGI_ADMIN_USER_IDS);
    const configuredNames = splitEnv(
      process.env.MAGI_ADMIN_USERNAMES ?? process.env.MAGI_ADMIN_USERNAME ?? "admin",
    );
    const allowListed =
      configuredIds.includes(sessionUser.id) ||
      (!!sessionUser.username && configuredNames.includes(sessionUser.username));

    if (role !== "admin" && !allowListed) {
      throw new ForbiddenException({
        code: "admin-role-required",
        title: "需要管理员权限",
        status: 403,
      });
    }

    req.user = session.user;
    return true;
  }
}

function splitEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
