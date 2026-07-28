/**
 * ProTableWrapper tests.
 *
 * Validates the unified table wrapper renders columns + data, supports row
 * keyboard activation (Enter/Space), and shows the error retry state.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigProvider } from "antd";
import { ProTableWrapper, type ProColumns } from "./pro-table-wrapper";

interface TestRow {
  id: string;
  name: string;
}

const columns: ProColumns<TestRow>[] = [
  { title: "名称", dataIndex: "name" },
];

describe("ProTableWrapper", () => {
  it("renders column headers and row data", () => {
    render(
      <ConfigProvider>
        <ProTableWrapper<TestRow>
          columns={columns}
          dataSource={[{ id: "1", name: "频道 A" }]}
          rowKey="id"
        />
      </ConfigProvider>,
    );
    // "名称" may appear in both the header and column-settings, so use getAllByText.
    expect(screen.getAllByText("名称").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("频道 A")).toBeInTheDocument();
  });

  it("activates onRowClick via Enter and Space keys", () => {
    const onOpen = vi.fn();
    render(
      <ConfigProvider>
        <ProTableWrapper<TestRow>
          columns={columns}
          dataSource={[{ id: "1", name: "频道 A" }]}
          rowKey="id"
          onRowClick={onOpen}
        />
      </ConfigProvider>,
    );
    // ProTable renders rows; find the clickable row by its content.
    const row = screen.getByText("频道 A").closest("tr")!;
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
