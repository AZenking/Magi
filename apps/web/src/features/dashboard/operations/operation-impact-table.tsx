/**
 * OperationImpactTable (T045).
 *
 * Paged change-item table for the preview UI. Uses ProTable (via
 * ProTableWrapper) with stable IDs as row keys (FR-015). antd v6 visual
 * language (T001): 14px body, 4px grid spacing, single primary action,
 * token-driven colors.
 */
import { Alert, Badge, Space, Tag } from "antd";
import { ProTableWrapper } from "@/components/pro-table-wrapper";
import type { ProColumns } from "@ant-design/pro-components";
import { useChangeItems } from "./operation-queries";

interface ChangeItemRow extends Record<string, unknown> {
  itemId: string;
  classification?: string;
  action?: string;
  selected: boolean;
  confidence?: number | null;
  reasonCode?: string;
}

export function OperationImpactTable({ changeSetId }: { changeSetId: string }) {
  const { data, isLoading } = useChangeItems(changeSetId, 1);

  const columns: ProColumns<ChangeItemRow>[] = [
    {
      title: "分类",
      dataIndex: "classification",
      width: 120,
      render: (_, record) => {
        const c = record.classification;
        const color =
          c === "conflict" ? "error" : c === "fuzzy" ? "warning" : "success";
        return <Tag color={color === "success" ? undefined : color}>{c ?? "—"}</Tag>;
      },
    },
    {
      title: "动作",
      dataIndex: "action",
      width: 120,
    },
    {
      title: "状态",
      dataIndex: "selected",
      width: 100,
      render: (_, record) =>
        record.selected ? (
          <Badge status="processing" text="已选" />
        ) : (
          <Badge status="default" text="未选" />
        ),
    },
    {
      title: "可信度",
      dataIndex: "confidence",
      width: 100,
      render: (_, record) =>
        record.confidence != null ? `${Math.round(record.confidence * 100)}%` : "—",
    },
    {
      title: "依据",
      dataIndex: "reasonCode",
    },
  ];

  const items = (data?.items ?? []) as ChangeItemRow[];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        title="影响明细"
        description="每项使用稳定标识，不依赖行号。冲突项需处理后才能应用。"
      />
      <ProTableWrapper<ChangeItemRow>
        columns={columns}
        dataSource={items}
        rowKey="itemId"
        loading={isLoading}
      />
    </Space>
  );
}
