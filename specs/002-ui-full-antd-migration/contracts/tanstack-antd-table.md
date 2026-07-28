# TanStack Table + antd Table 衔接契约

**Feature**: 002-ui-full-antd-migration
**Date**: 2026-07-21
**Related**: T002、[migration-map.md "data-table"](./migration-map.md#数据展示us4a--pr5)

## 背景

项目用 `@tanstack/react-table` 8.21.3 做数据表格的逻辑层（rowModel、columnDef、状态管理、rowSelection）。本特性要把渲染层从 shadcn Table 换成 antd Table。**TanStack Table 逻辑层保留不动**，只换渲染层。

## 衔接方案

### 1. 数据转换

```ts
// TanStack Table instance → antd Table dataSource
const rows = table.getRowModel().rows;
const dataSource = rows.map(row => ({
  key: row.id,           // antd Table 需要 key
  ...row.original,       // 原始数据
}));

// columnDef → antd columns
const columns = table.getAllColumns().map(col => ({
  title: typeof col.columnDef.header === 'string'
    ? col.columnDef.header
    : col.columnDef.meta?.title ?? col.id,
  dataIndex: col.id,
  key: col.id,
  render: (_value, _record, index) => {
    const row = rows[index];
    const cell = row.getVisibleCells().find(c => c.column.id === col.id);
    return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
  },
  sorter: col.getCanSort(),
  sortOrder: col.getIsSorted() || null,
  width: col.columnDef.meta?.width,
  fixed: col.columnDef.meta?.fixed,
}));
```

### 2. 状态驱动

```ts
// 分页
<Pagination
  current={table.getState().pagination.pageIndex + 1}
  pageSize={table.getState().pagination.pageSize}
  total={table.getRowCount()}
  showSizeChanger
  onChange={(page, pageSize) => table.setPagination({ pageIndex: page - 1, pageSize })}
/>

// 排序（在 antd Table 上）
<Table
  dataSource={dataSource}
  columns={columns}
  onChange={(_pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (!s || !s.field) return table.setSorting([]);
    table.setSorting([{
      id: String(s.field),
      desc: s.order === 'descend',
    }]);
  }}
/>
```

### 3. rowSelection

```ts
const rowSelection = {
  selectedRowKeys: table.getSelectedRowModel().map(r => r.id),
  onChange: (keys) => table.setRowSelection(Object.fromEntries(keys.map(k => [k, true]))),
};
<Table rowSelection={rowSelection} dataSource={dataSource} columns={columns} />
```

## 新组件签名（T026 实现）

`apps/web/src/components/data-table.tsx`:

```tsx
import { Table, type TableProps } from 'antd';
import type { Table as TanstackTable, RowData } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';

type DataTableProps<TData extends RowData> = {
  table: TanstackTable<TData>;
} & Omit<TableProps<TData & { key: string }>, 'dataSource' | 'columns'>;

export function DataTable<TData extends RowData>({ table, ...rest }: DataTableProps<TData>) {
  const rows = table.getRowModel().rows;
  const dataSource = rows.map(row => ({ ...row.original, key: row.id }));
  const columns = table.getAllColumns()
    .filter(col => col.getIsVisible())
    .map(col => ({
      title: col.columnDef.header as React.ReactNode,
      key: col.id,
      render: (_v: unknown, _r: unknown, index: number) => {
        const cell = rows[index]?.getAllCells().find(c => c.column.id === col.id);
        return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
      },
    }));

  return (
    <Table
      dataSource={dataSource}
      columns={columns}
      rowKey="key"
      pagination={false}  // 用独立 Pagination 组件
      loading={table.getRowModel().rows.length === 0 && table.getState().pagination.pageIndex === 0}
      {...rest}
    />
  );
}
```

## 注意

- TanStack Table v8 的 `flexRender` 是核心工具，把 cell 函数转为 React 节点。
- 不再需要 shadcn 的 `<TableRow>` / `<TableCell>` —— antd Table 自己渲染 `<tr>` / `<td>`。
- columnDef 的 `header` 可以是 string 或 `(props) => ReactNode`；后者用于排序图标（详见 T027 data-table-column-header）。
- antd Table 默认 `pagination={true}` 会自动加分页器；本契约显式 `pagination={false}` 用独立 Pagination 组件（T028）以保持 TanStack Table 状态控制权。
