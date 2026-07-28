import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigProvider } from "antd";
import type { TaskVo } from "@magi/types";
import { TaskDetailContent } from "./task-detail-content";

const baseTask: TaskVo = {
  id: "task-1",
  sourceType: "m3u",
  taskType: "m3u-sync",
  sourceId: "source-1",
  status: "failed",
  startedAt: "2026-07-26T08:00:00.000Z",
  finishedAt: "2026-07-26T08:00:05.000Z",
  error: "连接源失败",
  progress: 40,
  currentStep: "下载源",
  importedCount: 10,
  addedCount: 4,
  updatedCount: 6,
  removedCount: 0,
  queueName: "source-sync",
  jobId: "job-1",
  attemptsMade: 1,
  processedOn: "2026-07-26T08:00:01.000Z",
  createdAt: "2026-07-26T07:59:59.000Z",
};

function renderTask(task: TaskVo, onRetry = vi.fn(), onCancel = vi.fn()) {
  render(
    <ConfigProvider>
      <TaskDetailContent task={task} onRetry={onRetry} onCancel={onCancel} />
    </ConfigProvider>,
  );
  return { onRetry, onCancel };
}

describe("TaskDetailContent", () => {
  it("shows failure details and lets the user retry", () => {
    const { onRetry } = renderTask(baseTask);

    expect(screen.getByText("任务执行失败")).toBeInTheDocument();
    expect(screen.getByText("连接源失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /重试/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers cancellation only for pending tasks", () => {
    const { onCancel } = renderTask({
      ...baseTask,
      status: "pending",
      error: null,
      finishedAt: null,
    });

    fireEvent.click(screen.getByRole("button", { name: /取消/ }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /重试/ }),
    ).not.toBeInTheDocument();
  });
});
