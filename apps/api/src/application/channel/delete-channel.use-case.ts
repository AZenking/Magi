import { Injectable } from "@nestjs/common";

@Injectable()
export class DeleteChannelUseCase {
  async execute(_id: string): Promise<void> {
    // TODO: implement business logic
  }
}
