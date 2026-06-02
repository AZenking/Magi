import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { auth } from "../../infrastructure/auth/auth.config";

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session) {
      throw new UnauthorizedException("未登录或会话已过期");
    }

    req.user = session.user;
    return true;
  }
}
