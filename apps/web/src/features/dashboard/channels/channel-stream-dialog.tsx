import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  Avatar,
  Button,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Tabs,
  Typography,
  theme,
} from "antd";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { PaginatedResponse, ChannelVo, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import { useFeedback } from "@/lib/feedback";

const streamFormSchema = z.object({
  streamUrl: z.string().min(1, "请输入播放地址").url("请输入有效的 URL"),
});

type StreamMode = "manual" | "picker";

interface ChannelStreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
  initialSourceChannelId?: string | null;
  initialM3uSourceId?: string | null;
  onSubmit: (data: {
    streamUrl: string;
    m3uSourceId?: string | null;
    sourceChannelId?: string | null;
  }) => Promise<void>;
  title?: string;
}

export function ChannelStreamDialog({
  open,
  onOpenChange,
  initialUrl,
  initialSourceChannelId,
  initialM3uSourceId,
  onSubmit,
  title,
}: ChannelStreamDialogProps) {
  const { token } = theme.useToken();
  const { message } = useFeedback();
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<StreamMode>("manual");
  const [selectedSourceId, setSelectedSourceId] = useState(
    initialM3uSourceId ?? "",
  );
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    initialSourceChannelId ?? null,
  );
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(
    initialUrl ?? "",
  );
  const debouncedPickerSearch = useDebouncedValue(pickerSearch);

  const form = useForm({
    defaultValues: {
      streamUrl: initialUrl ?? "",
    },
    validators: {
      onChangeAsync: streamFormSchema as never,
    },
    onSubmit: async ({ value }) => {
      setPending(true);
      try {
        await onSubmit({ streamUrl: value.streamUrl });
        message.success("播放源已保存");
        onOpenChange(false);
      } catch (err) {
        message.error(
          `保存失败：${err instanceof Error ? err.message : "请稍后重试"}`,
        );
      } finally {
        setPending(false);
      }
    },
  });

  async function handlePickerSubmit() {
    if (!selectedChannelId || !selectedChannelUrl) return;
    setPending(true);
    try {
      await onSubmit({
        streamUrl: selectedChannelUrl,
        sourceChannelId: selectedChannelId,
        m3uSourceId: selectedSourceId || null,
      });
      message.success("播放源已保存");
      onOpenChange(false);
    } catch (err) {
      message.error(
        `保存失败：${err instanceof Error ? err.message : "请稍后重试"}`,
      );
    } finally {
      setPending(false);
    }
  }

  const { data: sourcesData } = useQuery({
    queryKey: ["sources", "m3u", "picker"],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<SourceVo> }>(
        "/sources",
        {
          params: { type: "m3u", pageSize: 100 },
        },
      ),
    enabled: open,
  });

  const m3uSources = sourcesData?.data?.items ?? [];

  const { data: channelsData } = useQuery({
    queryKey: [
      "raw-channels",
      "picker",
      selectedSourceId,
      debouncedPickerSearch,
    ],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<ChannelVo> }>(
        "/channels",
        {
          params: {
            sourceId: selectedSourceId || undefined,
            pageSize: 50,
            search: debouncedPickerSearch || undefined,
          },
        },
      ),
    enabled: open && mode === "picker",
  });

  const pickerChannels = channelsData?.data?.items ?? [];

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setMode("manual");
      setSelectedSourceId("");
      setPickerSearch("");
      setSelectedChannelId(null);
      setSelectedChannelUrl("");
      form.reset();
    }
    onOpenChange(nextOpen);
  }

  const sourceOptions = [
    { value: "all", label: "全部 M3U 源" },
    ...m3uSources.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <Modal
      open={open}
      title={title ?? "播放源"}
      onCancel={() => handleOpenChange(false)}
      footer={null}
      width={560}
      destroyOnHidden
    >
      <Tabs
        activeKey={mode}
        onChange={(k) => setMode(k as StreamMode)}
        items={[
          {
            key: "manual",
            label: "手动输入",
            children: (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void form.handleSubmit();
                }}
              >
                <Form layout="vertical" disabled={pending}>
                  <form.Field name="streamUrl">
                    {(field) => {
                      const firstError = field.state.meta.errors[0] as unknown;
                      const error =
                        field.state.meta.isTouched && !field.state.meta.isValid
                          ? firstError instanceof Error
                            ? firstError.message
                            : String(firstError ?? "")
                          : undefined;
                      return (
                        <Form.Item
                          label="播放地址"
                          validateStatus={error ? "error" : ""}
                          help={error}
                        >
                          <Input
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            placeholder="https://..."
                            autoComplete="url"
                          />
                        </Form.Item>
                      );
                    }}
                  </form.Field>
                  <Flex justify="flex-end" gap={token.marginXS}>
                    <Button
                      onClick={() => handleOpenChange(false)}
                      disabled={pending}
                    >
                      取消
                    </Button>
                    <Button type="primary" htmlType="submit" loading={pending}>
                      保存
                    </Button>
                  </Flex>
                </Form>
              </form>
            ),
          },
          {
            key: "picker",
            label: "从原始频道选择",
            children: (
              <Flex vertical gap={token.marginMD}>
                <Flex wrap gap={token.marginXS}>
                  <Select
                    style={{ flex: 1 }}
                    value={selectedSourceId || "all"}
                    onChange={(v) => {
                      setSelectedSourceId(v === "all" ? "" : v);
                      setSelectedChannelId(null);
                      setSelectedChannelUrl("");
                    }}
                    options={sourceOptions}
                    aria-label="M3U 源筛选"
                  />
                  <Input
                    style={{ flex: 1 }}
                    placeholder="搜索频道…"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    autoComplete="off"
                  />
                </Flex>

                <div
                  style={{
                    maxHeight: 300,
                    overflowY: "auto",
                    border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
                    borderRadius: token.borderRadius,
                  }}
                >
                  {pickerChannels.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="无频道数据"
                    />
                  ) : (
                    pickerChannels
                      .filter((c) => c.streamUrl)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            textAlign: "left",
                            background:
                              selectedChannelId === c.id
                                ? token.colorPrimaryBg
                                : "transparent",
                            border: "none",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setSelectedChannelId(c.id);
                            setSelectedChannelUrl(c.streamUrl!);
                          }}
                        >
                          {c.tvgLogo ? (
                            <Avatar
                              shape="square"
                              size={20}
                              src={c.tvgLogo}
                              alt=""
                            />
                          ) : (
                            <Avatar shape="square" size={20} />
                          )}
                          <span
                            style={{
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {c.displayName}
                          </span>
                          {c.groupTitle && (
                            <span
                              style={{
                                fontSize: 12,
                                color: token.colorTextSecondary,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.groupTitle}
                            </span>
                          )}
                        </button>
                      ))
                  )}
                </div>

                {selectedChannelId && (
                  <Typography.Text type="secondary">
                    已选择：
                    {pickerChannels.find((c) => c.id === selectedChannelId)
                      ?.displayName ?? ""}
                  </Typography.Text>
                )}

                <Flex justify="flex-end" gap={token.marginXS}>
                  <Button
                    onClick={() => handleOpenChange(false)}
                    disabled={pending}
                  >
                    取消
                  </Button>
                  <Button
                    type="primary"
                    disabled={
                      pending || !selectedChannelId || !selectedChannelUrl
                    }
                    onClick={handlePickerSubmit}
                    loading={pending}
                  >
                    确认选择
                  </Button>
                </Flex>
              </Flex>
            ),
          },
        ]}
      />
    </Modal>
  );
}
