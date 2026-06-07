import { Inject, Injectable } from "@nestjs/common";
import type { TaskQueuePort, TaskType } from "@/domain/task-execution";

@Injectable()
export class EnqueueSyncUseCase {
  constructor(
    @Inject("TASK_QUEUE_PORT")
    private readonly queue: TaskQueuePort,
  ) {}

  async execute(sourceType: "m3u" | "xmltv", sourceId: string): Promise<{ taskId: string }> {
    const taskType: TaskType = sourceType === "m3u" ? "m3u-sync" : "xmltv-sync";
    const { taskId } = await this.queue.enqueue(taskType, { sourceId, sourceType });
    return { taskId };
  }

  async enqueueEpgMatch(sourceId: string): Promise<{ taskId: string }> {
    const { taskId } = await this.queue.enqueue("epg-match", { sourceId, sourceType: "xmltv" });
    return { taskId };
  }

  async enqueueStreamCheck(sourceId?: string): Promise<{ taskId: string }> {
    const { taskId } = await this.queue.enqueue("stream-check", { sourceId: sourceId ?? null, sourceType: "m3u" });
    return { taskId };
  }

  async enqueueSourceCheck(sourceType: "m3u" | "xmltv", sourceId: string): Promise<{ taskId: string }> {
    const { taskId } = await this.queue.enqueue("source-check", { sourceId, sourceType });
    return { taskId };
  }
}
