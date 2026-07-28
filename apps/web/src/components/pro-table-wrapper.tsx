/**
 * ProTable wrapper — unified table component replacing the custom TanStack-based
 * DataTable. Uses @ant-design/pro-components ProTable with dataSource mode
 * (data stays managed by TanStack Query; ProTable handles rendering/pagination/
 * column settings/sorting).
 *
 * antd v6 visual language (T001): token-driven, 4px grid, single primary action.
 * Search form is disabled (search={false}) — filtering stays in the page-level
 * FilterBar to minimize visual change.
 */
import {
  ProTable,
  type ProColumns,
  type ActionType,
  type ProTableProps,
} from "@ant-design/pro-components";
import { Button, Result } from "antd";
import type { TableRowSelection } from "antd/es/table/interface";
import type { ReactNode } from "react";
import { useRef } from "react";

export interface ProTableWrapperProps<T = object> {
  /** Column definitions (ProColumns format). */
  columns: ProColumns<T>[];
  /** Data array (managed by the caller via TanStack Query). */
  dataSource: T[];
  /** Row key field name (default "id"). */
  rowKey?: string | ((record: T) => string);
  /** Loading state. */
  loading?: boolean;
  /** Error object — renders a retry Result in the empty state. */
  error?: Error | null;
  /** Retry callback for the error state. */
  onRetry?: () => void;
  /** Click handler for rows (makes rows keyboard-accessible). */
  onRowClick?: (record: T) => void;
  /** Row selection config (antd rowSelection). */
  rowSelection?: TableRowSelection<T>;
  /** Sorter change handler for manual (server-side) sorting. */
  onSorterChange?: (field: string | undefined, order: "ascend" | "descend" | null) => void;
  /** Current sort state for controlled sorting. */
  sortState?: { field: string; order: "ascend" | "descend" } | null;
  /** Toolbar title. */
  headerTitle?: ReactNode;
  /** Toolbar action buttons (right side). */
  toolBarRender?: React.ComponentProps<typeof ProTable>["toolBarRender"];
  /** Column-state persistence key (localStorage). */
  columnsStateKey?: string;
  /**
   * Pagination override. When provided, replaces the default client-side
   * pagination config — use this for server-side pagination by passing
   * `{ current, pageSize, total, onChange }`.
   */
  pagination?: React.ComponentProps<typeof ProTable>["pagination"];
  /** Extra ProTable props passthrough. */
  proTableProps?: Partial<ProTableProps<T, Record<string, unknown>>>;
}

export function ProTableWrapper<T extends object>({
  columns,
  dataSource,
  rowKey = "id",
  loading,
  error,
  onRetry,
  onRowClick,
  rowSelection,
  onSorterChange,
  sortState,
  headerTitle,
  toolBarRender,
  columnsStateKey,
  pagination,
  proTableProps,
}: ProTableWrapperProps<T>) {
  const actionRef = useRef<ActionType>(null);

  return (
    <ProTable<T>
      {...proTableProps}
      actionRef={actionRef}
      columns={columns}
      dataSource={dataSource}
      rowKey={rowKey}
      loading={loading}
      search={false}
      options={{
        density: false,
        reload: false,
        fullScreen: false,
        setting: { draggable: false, checkable: true, listsHeight: 400 },
      }}
      pagination={
        pagination ?? {
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
        }
      }
      scroll={{ x: "max-content" }}
      size="middle"
      headerTitle={headerTitle}
      toolBarRender={toolBarRender}
      columnsState={
        columnsStateKey
          ? {
              persistenceKey: columnsStateKey,
              persistenceType: "localStorage" as const,
            }
          : undefined
      }
      rowSelection={rowSelection}
      locale={{
        emptyText: error ? (
          <Result
            status="error"
            title="数据加载失败"
            subTitle={error.message}
            extra={onRetry ? <Button onClick={onRetry}>重试</Button> : undefined}
          />
        ) : undefined,
      }}
      onChange={(_pagination, _filters, sorter) => {
        if (!onSorterChange) return;
        const s = Array.isArray(sorter) ? sorter[0] : sorter;
        if (!s || !s.field || !s.order) {
          onSorterChange(undefined, null);
          return;
        }
        onSorterChange(
          String(s.field),
          s.order as "ascend" | "descend",
        );
      }}
      onRow={
        onRowClick
          ? (((record: T) => ({
              role: "button",
              tabIndex: 0,
              style: { cursor: "pointer" },
              onClick: () => onRowClick(record),
              onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                if (
                  event.currentTarget !== event.target ||
                  (event.key !== "Enter" && event.key !== " ")
                ) {
                  return;
                }
                event.preventDefault();
                onRowClick(record);
              },
            })) as never)
          : undefined
      }
    />
  );
}

export type { ProColumns };
export type { ActionType };
