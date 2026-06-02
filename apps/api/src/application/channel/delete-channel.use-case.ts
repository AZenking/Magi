import { Injectable } from "@nestjs/common";

@Injectable()
export class DeleteChannelUseCase {
  async execute(id: string): Promise<void> {
    // TODO: implement business logic
  }
}
