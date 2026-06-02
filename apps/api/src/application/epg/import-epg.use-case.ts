import { Injectable } from "@nestjs/common";

@Injectable()
export class ImportEpgUseCase {
  async execute(sourceId: string): Promise<void> {
    // TODO: enqueue XMLTV import task to BullMQ
  }
}
