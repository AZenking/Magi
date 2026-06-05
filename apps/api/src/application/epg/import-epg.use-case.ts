import { Inject, Injectable } from "@nestjs/common";
import type { TaskQueuePort } from "@/domain/task-execution";

@Injectable()
export class ImportEpgUseCase {
  constructor(
    @Inject("TASK_QUEUE_PORT")
    private readonly queue: TaskQueuePort,
  ) {}

  async execute(sourceId: string): Promise<{ taskId: string }> {
    const { taskId } = await this.queue.enqueue("import-epg", { sourceId, sourceType: "xmltv" });
    return { taskId };
  }
}
