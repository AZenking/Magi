import { Injectable } from "@nestjs/common";

@Injectable()
export class UpdateChannelUseCase {
  async execute(id: string, data: unknown): Promise<unknown> {
    // TODO: implement business logic
    return null;
  }
}
