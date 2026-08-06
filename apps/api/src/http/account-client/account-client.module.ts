import { Module } from "@nestjs/common";
import { OauthModule } from "../oauth-client/oauth.module";
import { AccountClientController } from "./account-client.controller";

@Module({ imports: [OauthModule], controllers: [AccountClientController] })
export class AccountClientModule {}
