import type { ProColumns } from "@ant-design/pro-components";
import { Link } from "@tanstack/react-router";
import type { CanonicalChannelVo } from "@magi/types";
import { Button, Flex, Tag, theme } from "antd";
import {
  lifecycleMap,
  formatPurgeAfter,
} from "@/features/dashboard/channels/channel-lifecycle-actions";
import {
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ExportOutlined,
  StarFilled,
} from "@ant-design/icons";

const epgStatusMap: Record<string, { label: string; color?: string }> = {
  matched_auto: { label: "自动匹配", color: "processing" },
  matched_manual: { label: "手动匹配", color: "blue" },
  unmatched: { label: "未匹配" },
  conflict: { label: "冲突", color: "error" },
};

const outputStatusMap: Record<string, { label: string; color?: string }> = {
  active: { label: "正常", color: "success" },
  degraded: { label: "降级", color: "warning" },
  unavailable: { label: "不可用", color: "error" },
  inactive: { label: "停用" },
  unknown: { label: "未知" },
};

interface ColumnContext {
  onEdit?: (channel: CanonicalChannelVo) => void;
  onToggleHidden?: (channel: CanonicalChannelVo) => void;
  /** Trash tab shows purgeAfter instead of the hide toggle (T060). */
  trashView?: boolean;
}

export function getChannelColumns(
  ctx?: ColumnContext,
): ProColumns<CanonicalChannelVo>[] {
  const columns: ProColumns<CanonicalChannelVo>[] = [
    {
      title: "频道名称",
      dataIndex: "standardName",
      render: (_, record) => <ChannelNameCell channel={record} />,
    },
    {
      title: "分组",
      dataIndex: "standardGroup",
      render: (_, record) => record.standardGroup ?? "-",
    },
    {
      title: "EPG",
      dataIndex: "epgStatus",
      render: (_, record) => {
        const s = epgStatusMap[record.epgStatus] ?? { label: record.epgStatus };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "输出",
      dataIndex: "outputStatus",
      render: (_, record) => {
        const s = outputStatusMap[record.outputStatus] ?? {
          label: record.outputStatus,
        };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "状态",
      dataIndex: "lifecycle",
      render: (_, record) => {
        const s = lifecycleMap[record.lifecycle ?? "active"];
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "tvg-id",
      dataIndex: "epgChannelId",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {record.epgChannelId ?? "-"}
        </span>
      ),
    },
    {
      title: "频道号",
      dataIndex: "channelNumber",
      render: (_, record) => record.channelNumber ?? "-",
    },
  ];

  // Conditional column: trash view shows purgeAfter, otherwise hide toggle.
  if (ctx?.trashView) {
    columns.push({
      title: "可清除时间",
      dataIndex: "purgeAfter",
      render: (_, record) => formatPurgeAfter(record.purgeAfter),
    });
  } else {
    columns.push({
      title: "隐藏",
      dataIndex: "hidden",
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          icon={record.hidden ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            ctx?.onToggleHidden?.(record);
          }}
          aria-label={record.hidden ? "显示" : "隐藏"}
        />
      ),
    });
  }

  // Action column (always last, fixed right).
  columns.push({
    title: "操作",
    valueType: "option",
    hideInSetting: true,
    fixed: "right",
    width: 100,
    render: (_, record) => [
      <Link
        key="detail"
        to="/dashboard/channels/$channelId"
        params={{ channelId: record.id }}
      >
        <Button type="text" size="small" icon={<ExportOutlined />} aria-label="详情" />
      </Link>,
      ...(ctx?.onEdit
        ? [
            <Button
              key="edit"
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onEdit!(record);
              }}
              aria-label="编辑"
            />,
          ]
        : []),
    ],
  });

  return columns;
}

function ChannelNameCell({ channel }: { channel: CanonicalChannelVo }) {
  const { token } = theme.useToken();

  return (
    <Flex align="center" gap={token.marginXS}>
      {channel.starred && (
        <StarFilled style={{ color: token.colorWarning }} aria-label="已收藏" />
      )}
      {channel.standardLogo ? (
        <img
          src={channel.standardLogo}
          alt=""
          style={{
            width: 20,
            height: 20,
            borderRadius: token.borderRadiusSM,
            objectFit: "contain",
          }}
          loading="lazy"
        />
      ) : (
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: token.borderRadiusSM,
            background: token.colorFillSecondary,
          }}
        />
      )}
      <Link
        to="/dashboard/channels/$channelId"
        params={{ channelId: channel.id }}
        style={{ fontWeight: 600 }}
      >
        {channel.standardName}
      </Link>
    </Flex>
  );
}
