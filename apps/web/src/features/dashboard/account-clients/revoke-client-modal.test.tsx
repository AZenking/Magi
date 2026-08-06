/**
 * RevokeClientModal tests (T052, US3).
 *
 * Verifies the modal shows the target name + terminal-state impact copy,
 * cancel does not submit, confirm calls POST revoke, shows success + closes
 * on success, and shows an error while keeping context on failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ConfigProvider, App as AntdApp } from "antd";
import { renderWithQuery } from "@/test/query-test-utils";
import { deviceClientFixture } from "@/test/device-client-fixtures";
import { RevokeClientModal } from "./revoke-client-modal";

const mutateAsync = vi.fn();

vi.mock("./client-queries", () => ({
  useRevokeDeviceClient: () => ({
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
        <RevokeClientModal client={client} open={open} onClose={onClose} />
      </AntdApp>
    </ConfigProvider>,
  );
}

describe("RevokeClientModal", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    messageSuccess.mockReset();
    messageError.mockReset();
  });

  it("shows the target device name and the terminal-state impact copy", () => {
    renderModal(true);
    expect(screen.getByText(/客厅电视/)).toBeInTheDocument();
    // The impact copy explains revocation consequences.
    expect(screen.getByText(/撤销后该设备立即失去访问权限/)).toBeInTheDocument();
  });

  it("cancel closes without submitting", () => {
    const onClose = vi.fn();
    renderModal(true, onClose);
    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));
    expect(onClose).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("confirm submits the revoke and closes on success", async () => {
    const onClose = vi.fn();
    mutateAsync.mockResolvedValueOnce({});
    renderModal(true, onClose);

    fireEvent.click(screen.getByRole("button", { name: /撤\s*销\s*访\s*问/ }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(deviceClientFixture.id);
    });
    await waitFor(() => {
      expect(messageSuccess).toHaveBeenCalledWith("客户端访问已撤销");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows an error and stays open when revoke fails", async () => {
    const onClose = vi.fn();
    mutateAsync.mockRejectedValueOnce(new Error("server error"));
    renderModal(true, onClose);

    fireEvent.click(screen.getByRole("button", { name: /撤\s*销\s*访\s*问/ }));

    await waitFor(() => {
      expect(messageError).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not submit when there is no client", async () => {
    renderWithQuery(
      <ConfigProvider>
        <AntdApp>
          <RevokeClientModal client={null} open={true} onClose={vi.fn()} />
        </AntdApp>
      </ConfigProvider>,
    );
    // The revoke button exists but submit guard returns early for null client.
    fireEvent.click(screen.getByRole("button", { name: /撤\s*销\s*访\s*问/ }));
    // Give the async path a tick; mutateAsync must never be called.
    await waitFor(() => {
      expect(mutateAsync).not.toHaveBeenCalled();
    });
  });
});
