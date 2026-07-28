import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, ConfigProvider } from "antd";
import { PageHeader } from "./page-layout";

describe("PageHeader", () => {
  it("renders the title, description, and actions", () => {
    const onRefresh = vi.fn();

    render(
      <ConfigProvider>
        <PageHeader
          title="频道管理"
          description="管理规范频道与播放源"
          actions={<Button onClick={onRefresh}>刷新</Button>}
        />
      </ConfigProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "频道管理" }),
    ).toBeInTheDocument();
    expect(screen.getByText("管理规范频道与播放源")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /刷\s*新/ }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
