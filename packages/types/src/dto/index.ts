import { z } from "zod";

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  });
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
  });
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const SourceQuerySchema = PaginationQuerySchema.extend({
  type: z.enum(["m3u", "xmltv"]).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});
export type SourceQuery = z.infer<typeof SourceQuerySchema>;

export const CreateSourceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["m3u", "xmltv"]),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("http://") || u.startsWith("https://")),
  enabled: z.boolean().default(true),
});
export type CreateSource = z.infer<typeof CreateSourceSchema>;

export const UpdateSourceSchema = CreateSourceSchema.partial();
export type UpdateSource = z.infer<typeof UpdateSourceSchema>;
