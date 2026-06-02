import { Injectable } from "@nestjs/common";

@Injectable()
export class RefreshEpgUseCase {
  async execute(sourceId: string): Promise<void> {
    // TODO: enqueue EPG refresh task to BullMQ
  }
}
