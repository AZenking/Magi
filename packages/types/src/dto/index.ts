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
  role: z.enum(["primary", "backup", "supplement", "test"]).default("primary"),
  priority: z.number().int().min(0).max(9999).default(100),
  participateInOutput: z.boolean().default(true),
  allowFallback: z.boolean().default(true),
});
export type CreateSource = z.infer<typeof CreateSourceSchema>;

export const UpdateSourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"))
    .optional(),
  enabled: z.boolean().optional(),
  role: z.enum(["primary", "backup", "supplement", "test"]).optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  participateInOutput: z.boolean().optional(),
  allowFallback: z.boolean().optional(),
});
export type UpdateSource = z.infer<typeof UpdateSourceSchema>;

// Safe Operations feature DTOs (T006 / T007 / T008 / T009).
// Each module owns its own schemas; this barrel is the single import surface
// consumed by API / Worker / Web. No parallel handwritten wire types allowed
// (constitution V).
export * from "./operation";
export * from "./channel-operations";
export * from "./task-operations";
export * from "./schedule";
export * from "./audit";
export * from "./backup";
export * from "./dashboard-operations";
export * from "./problem-details";
export * from "./concurrency";
export * from "./oauth-client";
export * from "./open-api";
export * from "./device-client";
export * from "./content-snapshot";
export * from "./playback-report";
