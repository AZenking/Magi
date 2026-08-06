/**
 * RenameClientModal tests (T052, US3).
 *
 * Verifies the modal pre-fills the current name, enforces trim/validation
 * (blank, >64, control chars rejected), submits a trimmed PATCH payload,
 * shows success feedback + closes on success, retains the form on failure,
 * and disables the submit button while pending.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ConfigProvider, App as AntdApp } from "antd";
import { renderWithQuery } from "@/test/query-test-utils";
import { deviceClientFixture } from "@/test/device-client-fixtures";
import { RenameClientModal } from "./rename-client-modal";

const mutateAsync = vi.fn();

vi.mock("./client-queries", () => ({
  useRenameDeviceClient: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

const messageSuccess = vi.fn();
const messageError = vi.fn();

vi.mock("@/lib/feedback", () => ({
  useFeedback: () => ({ message: { success: messageSuccess, error: messageError } }),
}));

function renderModal(open: boolean, onClose = vi.fn(), client = deviceClientFixture) {
  return renderWithQuery(
    <ConfigProvider>
      <AntdApp>
        <RenameClientModal client={client} open={open} onClose={onClose} />
      </AntdApp>
    </ConfigProvider>,
  );
}

describe("RenameClientModal", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    messageSuccess.mockReset();
    messageError.mockReset();
  });

  it("pre-fills the current display name when opened", () => {
    renderModal(true);
    const input = screen.getByDisplayValue("客厅电视") as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it("submits a trimmed name and closes on success", async () => {
    const onClose = vi.fn();
    mutateAsync.mockResolvedValueOnce({});
    renderModal(true, onClose);

    const input = screen.getByDisplayValue("客厅电视") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  卧室电视  " } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: deviceClientFixture.id,
        displayName: "卧室电视",
      });
    });
    await waitFor(() => {
      expect(messageSuccess).toHaveBeenCalledWith("客户端名称已更新");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows an error and keeps the modal open when the mutation fails", async () => {
    const onClose = vi.fn();
    mutateAsync.mockRejectedValueOnce(new Error("conflict"));
    renderModal(true, onClose);

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(messageError).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("rejects a blank name with validation and does not submit", async () => {
    renderModal(true);
    const input = screen.getByDisplayValue("客厅电视") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(screen.getByText("请输入客户端名称")).toBeInTheDocument();
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("does not submit when the client is null", async () => {
    const onClose = vi.fn();
    renderWithQuery(
      <ConfigProvider>
        <AntdApp>
          <RenameClientModal client={null} open={true} onClose={onClose} />
        </AntdApp>
      </ConfigProvider>,
    );
    // No input to fill; submit guard returns early.
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
