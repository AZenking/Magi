import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });

function normalizeChannelId(value: string): string {
  return value.startsWith("magi:") ? value.slice(5) : value;
}

const rawContentSnapshotQuerySchema = z.object({
  include: z.enum(["catalog", "guide", "all"]).default("catalog"),
  channelId: z.union([z.string(), z.array(z.string())]).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});

export const ContentSnapshotQuerySchema = rawContentSnapshotQuerySchema.transform(
  (query, context) => {
    const channelIds = (query.channelId === undefined
      ? []
      : Array.isArray(query.channelId)
        ? query.channelId
        : [query.channelId]
    )
      .map(normalizeChannelId)
      .filter((id, index, values) => id.length > 0 && values.indexOf(id) === index);

    if ((query.include === "guide" || query.include === "all") && channelIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["channelId"],
        message: "guide snapshots require at least one channelId",
      });
    }
    if (channelIds.length > 3) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        type: "array",
        maximum: 3,
        inclusive: true,
        path: ["channelId"],
        message: "at most three channelIds are allowed",
      });
    }
    if (query.include === "guide" || query.include === "all") {
      if (!query.from || !query.to) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["from"],
          message: "guide snapshots require from and to",
        });
      } else {
        const duration = new Date(query.to).getTime() - new Date(query.from).getTime();
        if (duration <= 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["to"],
            message: "to must be after from",
          });
        } else if (duration > 24 * 60 * 60 * 1000) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["to"],
            message: "guide snapshot window must not exceed 24 hours",
          });
        }
      }
    }

    return {
      include: query.include,
      channelIds,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };
  },
);
export type ContentSnapshotQuery = z.infer<typeof ContentSnapshotQuerySchema>;
