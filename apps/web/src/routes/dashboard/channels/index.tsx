import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useFeedback } from "@/lib/feedback";
import type {
  CanonicalChannelVo,
  ChannelLifecycle,
  PaginatedResponse,
  UpdateOutputChannel,
} from "@magi/types";
import { apiClient } from "@/services/api";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Dropdown, Flex, Tabs, theme } from "antd";
import type { MenuProps } from "antd";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import {
  DownOutlined,
  DownloadOutlined,
  FundProjectionScreenOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { getChannelColumns } from "@/features/dashboard/channels/columns";
import {
  ChannelLifecycleActions,
  lifecycleMap,
} from "@/features/dashboard/channels/channel-lifecycle-actions";
import { OutputChannelFormDialog } from "@/features/dashboard/channels/channel-form-dialog";
import { API_BASE } from "@/services/config";
import { PageHeader, PageStack } from "@/components/page-layout";

const LIFECYCLES: ChannelLifecycle[] = [
  "active",
  "hidden",
  "disabled",
  "trashed",
];

export const Route = createFileRoute("/dashboard/channels/")({
  // T059: lifecycle / sourcePresence live in the URL so views are shareable.
  validateSearch: (
    search: Record<string, unknown>,
  ): { lifecycle?: ChannelLifecycle; sourcePresence?: string } => ({
    lifecycle: LIFECYCLES.includes(search.lifecycle as ChannelLifecycle)
      ? (search.lifecycle as ChannelLifecycle)
      : undefined,
    sourcePresence:
      typeof search.sourcePresence === "string"
        ? search.sourcePresence
        : undefined,
  }),
  component: ChannelsPage,
});

function ChannelsPage() {
  const { message } = useFeedback();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const searchParams = Route.useSearch();
  const lifecycle: ChannelLifecycle = searchParams.lifecycle ?? "active";
  const sourcePresence = searchParams.sourcePresence ?? "";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [epgStatus, setEpgStatus] = useState<string>("");
  const [outputStatus, setOutputStatus] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");
  // T059/FR-015: cross-page row selection. preserveSelectedRowKeys keeps
  // selections stable across pagination; selectedChannels mirrors the full
  // selected records so batch actions have names without re-fetching.
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<CanonicalChannelVo[]>(
    [],
  );
  const [editingChannel, setEditingChannel] =
    useState<CanonicalChannelVo | null>(null);

  const { data: groupsData } = useQuery({
    queryKey: ["channel-groups"],
    queryFn: () =>
      apiClient<{ success: boolean; data: { name: string; count: number }[] }>(
        "/output/groups",
      ),
  });

  // T059: per-lifecycle counts drive the tab labels.
  const { data: countsData } = useQuery({
    queryKey: ["channel-lifecycle-counts"],
    queryFn: () =>
      apiClient<{ success: boolean; data: Record<string, number> }>(
        "/output/channels/lifecycle-counts",
      ),
  });
  const lifecycleCounts = countsData?.data ?? {};

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "output-channels",
      page,
      pageSize,
      epgStatus,
      outputStatus,
      groupFilter,
      searchFilter,
      lifecycle,
      sourcePresence,
    ],
    queryFn: () =>
      apiClient<{
        success: boolean;
        data: PaginatedResponse<CanonicalChannelVo>;
      }>("/output/channels", {
        params: {
          page,
          pageSize,
          epgStatus: epgStatus || undefined,
          outputStatus: outputStatus || undefined,
          group: groupFilter || undefined,
          search: searchFilter || undefined,
          lifecycle,
          sourcePresence: sourcePresence || undefined,
        },
      }),
  });

  const channels = data?.data?.items ?? [];

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    queryClient.invalidateQueries({ queryKey: ["channel-lifecycle-counts"] });
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateOutputChannel;
    }) => {
      return apiClient<{ success: boolean; data: CanonicalChannelVo }>(
        `/output/channels/${id}`,
        {
          method: "PUT",
          body,
        },
      );
    },
    onSuccess: () => {
      refresh();
    },
  });

  const checkStreamsMutation = useMutation({
    mutationFn: () =>
      apiClient<{ success: boolean; data: { taskId: string } }>(
        "/output/check-streams",
        {
          method: "POST",
          body: {},
        },
      ),
    onSuccess: () => {
      message.success("播放源检查已提交，检测中…");
      setPollingActive(true);
    },
    onError: (err) => {
      message.error(`提交检查失败：${err.message}`);
    },
  });

  // Polling after stream check submission
  const [pollingActive, setPollingActive] = useState(false);
  useEffect(() => {
    if (!pollingActive) return;
    const start = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - start > 30_000) {
        setPollingActive(false);
        clearInterval(interval);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["output-channels"] });
    }, 5_000);
    return () => clearInterval(interval);
  }, [pollingActive, queryClient]);

  const columns = useMemo<ProColumns<CanonicalChannelVo>[]>(() => {
    const base = getChannelColumns({
      onEdit: (ch) => setEditingChannel(ch),
      onToggleHidden: (ch) =>
        updateMutation.mutate({ id: ch.id, body: { hidden: !ch.hidden } }),
      trashView: lifecycle === "trashed",
      groupOptions:
        groupsData?.data?.map((group) => ({
          value: group.name,
          label: `${group.name} (${group.count})`,
        })) ?? [],
    });
    // Virtual keyword column: lives only in the search form, maps the form's
    // `keyword` value to the `search` query param.
    const searchColumn: ProColumns<CanonicalChannelVo> = {
      title: "搜索",
      dataIndex: "keyword",
      hideInTable: true,
      search: {
        transform: (value) => ({ search: value }),
      },
    };
    return [searchColumn, ...base];
  }, [updateMutation, lifecycle, groupsData]);

  // ProTable's QueryFilter submit/reset routes here. Map the form values to
  // the existing filter state variables so the useQuery picks them up.
  const handleSearch = useCallback((params: Record<string, unknown>) => {
    setSearchFilter((params.search as string) ?? "");
    setEpgStatus((params.epgStatus as string) ?? "");
    setOutputStatus((params.outputStatus as string) ?? "");
    setGroupFilter((params.standardGroup as string) ?? "");
    setPage(1);
  }, []);

  const exportItems: MenuProps["items"] = [
    {
      key: "m3u",
      label: (
        <a href={`${API_BASE}/output/m3u`} download>
          导出 M3U
        </a>
      ),
    },
    {
      key: "xmltv",
      label: (
        <a href={`${API_BASE}/output/xmltv`} download>
          导出 XMLTV
        </a>
      ),
    },
  ];

  return (
    <PageStack>
      <PageHeader
        title="频道管理"
        description="维护输出频道、EPG 关联与播放源可用性"
        actions={
          <Flex align="center" wrap gap={token.marginSM}>
            <Dropdown menu={{ items: exportItems }} trigger={["click"]}>
              <Button icon={<DownloadOutlined />}>
                导出 <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              type="primary"
              onClick={() => checkStreamsMutation.mutate()}
              disabled={checkStreamsMutation.isPending}
              loading={checkStreamsMutation.isPending}
              icon={<FundProjectionScreenOutlined />}
            >
              {checkStreamsMutation.isPending ? "提交中…" : "检查频道流"}
            </Button>
            <Button
              shape="circle"
              icon={<ReloadOutlined />}
              onClick={refresh}
              aria-label="刷新"
            />
          </Flex>
        }
      />

      <Tabs
        activeKey={lifecycle}
        onChange={(key) => {
          setPage(1);
          setSelectedRowKeys([]);
          setSelectedChannels([]);
          void navigate({
            search: (prev) => ({
              ...prev,
              lifecycle: key === "active" ? undefined : (key as ChannelLifecycle),
            }),
          });
        }}
        items={LIFECYCLES.map((state) => ({
          key: state,
          label: `${lifecycleMap[state].label} (${lifecycleCounts[state] ?? 0})`,
        }))}
      />

      {selectedChannels.length > 0 && (
        <ChannelLifecycleActions
          channels={selectedChannels}
          currentLifecycle={lifecycle}
          onDone={() => {
            setSelectedRowKeys([]);
            setSelectedChannels([]);
            refresh();
          }}
          onClearSelection={() => {
            setSelectedRowKeys([]);
            setSelectedChannels([]);
          }}
        />
      )}

      <ProTableWrapper
        columns={columns}
        dataSource={channels}
        rowKey="id"
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        search={true}
        onSearch={handleSearch}
        rowSelection={{
          type: "checkbox",
          selectedRowKeys,
          preserveSelectedRowKeys: true,
          onChange: (keys, rows) => {
            setSelectedRowKeys(keys);
            // antd only returns the current page's rows in `rows`; merge with
            // any previously selected rows (cross-page) keyed by id so the
            // batch action always has the full set of channel objects.
            const merged = new Map<string, CanonicalChannelVo>();
            for (const ch of selectedChannels) merged.set(ch.id, ch);
            for (const ch of rows) merged.set(ch.id, ch);
            const keySet = new Set(keys.map(String));
            setSelectedChannels(
              [...merged.values()].filter((ch) => keySet.has(ch.id)),
            );
          },
        }}
        pagination={{
          current: page,
          pageSize,
          total: data?.data?.total ?? 0,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          },
        }}
        columnsStateKey="channel-columns"
      />

      {editingChannel && (
        <OutputChannelFormDialog
          open={!!editingChannel}
          onOpenChange={(open) => {
            if (!open) setEditingChannel(null);
          }}
          channel={editingChannel}
          onSubmit={async (body) => {
            await updateMutation.mutateAsync({ id: editingChannel.id, body });
          }}
        />
      )}
    </PageStack>
  );
}
