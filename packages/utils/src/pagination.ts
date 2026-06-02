export interface PaginationInput {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function createPaginationMeta(total: number, input: PaginationInput): PaginationMeta {
  return {
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export function getOffset(input: PaginationInput): number {
  return (input.page - 1) * input.pageSize;
}
