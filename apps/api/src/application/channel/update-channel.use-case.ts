import { Injectable } from "@nestjs/common";

@Injectable()
export class UpdateChannelUseCase {
  async execute(_id: string, _data: unknown): Promise<unknown> {
    // TODO: implement business logic
    return null;
  }
}
