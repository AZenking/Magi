import type { ProColumns } from "@ant-design/pro-components";
import type { SourceVo } from "@magi/types";
import { Button, Tag } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  HeartOutlined,
  SyncOutlined,
} from "@ant-design/icons";

const checkStatusMap: Record<string, { label: string; color?: string }> = {
  online: { label: "正常", color: "success" },
  offline: { label: "不可达", color: "error" },
  unknown: { label: "未知" },
};

interface ColumnsContext {
  onEdit: (source: SourceVo) => void;
  onDelete: (source: SourceVo) => void;
  onSync: (source: SourceVo) => void;
  onCheck: (source: SourceVo) => void;
  syncingId: string | null;
  checkingId: string | null;
  /** Source currently being prepared for deletion (T108 preview-first flow). */
  deletingId?: string | null;
}

export function getSourceColumns({
  onEdit,
  onDelete,
  onSync,
  onCheck,
  syncingId,
  checkingId,
  deletingId = null,
}: ColumnsContext): ProColumns<SourceVo>[] {
  return [
    // Virtual keyword column: lives only in the search form, maps the form's
    // `keyword` value to the `search` query param.
    {
      title: "搜索",
      dataIndex: "keyword",
      hideInTable: true,
      search: {
        transform: (value) => ({ search: value }),
      },
    },
    {
      title: "名称",
      dataIndex: "name",
      search: false,
      ellipsis: true,
      sorter: true,
    },
    {
      title: "URL",
      dataIndex: "url",
      search: false,
      ellipsis: true,
      width: 300,
    },
    {
      title: "状态",
      dataIndex: "enabled",
      valueType: "select",
      valueEnum: {
        true: { text: "启用" },
        false: { text: "禁用" },
      },
      sorter: true,
      render: (_, record) => (
        <Tag color={record.enabled ? "success" : undefined}>
          {record.enabled ? "启用" : "禁用"}
        </Tag>
      ),
    },
    {
      title: "最后同步",
      dataIndex: "lastSyncAt",
      search: false,
      sorter: true,
      render: (_, record) =>
        record.lastSyncAt
          ? new Intl.DateTimeFormat("zh-CN", {
              dateStyle: "short",
              timeStyle: "medium",
            }).format(new Date(record.lastSyncAt))
          : "-",
    },
    {
      title: "源状态",
      dataIndex: "checkStatus",
      search: false,
      render: (_, record) => {
        const s = checkStatusMap[record.checkStatus ?? ""] ?? { label: "-" };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "最后检测",
      dataIndex: "lastCheckAt",
      search: false,
      render: (_, record) =>
        record.lastCheckAt
          ? new Intl.DateTimeFormat("zh-CN", {
              dateStyle: "short",
              timeStyle: "medium",
            }).format(new Date(record.lastCheckAt))
          : "-",
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      search: false,
      sorter: true,
      render: (_, record) =>
        new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "short",
          timeStyle: "medium",
        }).format(new Date(record.createdAt)),
    },
    {
      title: "操作",
      valueType: "option",
      hideInSetting: true,
      fixed: "right",
      width: 180,
      render: (_, record) => [
        <Button
          key="check"
          type="text"
          size="small"
          icon={<HeartOutlined />}
          onClick={() => onCheck(record)}
          disabled={checkingId === record.id}
          aria-label={`检测 ${record.name}`}
        />,
        <Button
          key="sync"
          type="text"
          size="small"
          icon={<SyncOutlined spin={syncingId === record.id} />}
          onClick={() => onSync(record)}
          disabled={syncingId === record.id}
          aria-label={`同步 ${record.name}`}
        />,
        <Button
          key="edit"
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={() => onEdit(record)}
          aria-label={`编辑 ${record.name}`}
        />,
        <Button
          key="delete"
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onDelete(record)}
          disabled={deletingId === record.id}
          loading={deletingId === record.id}
          aria-label={`删除 ${record.name}`}
        />,
      ],
    },
  ];
}
