/**
 * Operation query keys + mutations + target-scoped pending hooks (T044).
 *
 * TanStack Query integration for the Safe Operations preview/apply flow.
 * Mirrors the HTTP contract (T043). Loading state is keyed by taskId/target
 * so unrelated rows never show pending (FR-027).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";

// --- Query keys ---
export const operationKeys = {
  changeSet: (id: string) => ["operation", "change-set", id] as const,
  changeItems: (id: string, page: number, classification?: string) =>
    [
      "operation",
      "change-set",
      id,
      "items",
      page,
      classification ?? "all",
    ] as const,
  task: (id: string) => ["task", id] as const,
};

// --- Reads ---
interface ChangeSetData {
  id: string;
  status: string;
  version: number;
  baseVersions?: Record<string, number>;
  summary?: Record<string, unknown>;
  warnings?: { code: string; message: string; deletionRatio?: number }[];
  blockers?: { code: string; message: string }[];
  /** 009-m3u-control-plane: anomaly flag + structured classification. */
  requiresConfirmation?: boolean;
  anomalyClassification?: {
    requiresConfirmation: boolean;
    warnings: Array<{
      code: "empty-snapshot" | "deletion-ratio-exceeded" | "duplicate-identity";
      message: string;
      deletionRatio: number;
    }>;
  } | null;
  /** 009: source-scoped snapshot metadata for the source list "last result". */
  snapshotId?: string | null;
  sourceVersion?: number | null;
}
interface ChangeItemsData {
  items: Array<{
    itemId: string;
    classification?: string;
    action?: string;
    selected: boolean;
    confidence?: number | null;
    reasonCode?: string;
  }>;
  total: number;
}

/** API envelope (contracts/common.md): every response wraps payload in `data`. */
interface Envelope<T> {
  success: boolean;
  data: T;
}

export function useChangeSet(changeSetId: string | null) {
  return useQuery({
    queryKey: operationKeys.changeSet(changeSetId ?? ""),
    queryFn: async () => {
      const res = await apiClient<Envelope<ChangeSetData>>(
        `/operations/change-sets/${changeSetId}`,
      );
      return res.data;
    },
    enabled: !!changeSetId,
    // Prepare runs async in the Worker; poll until the change set leaves
    // `preparing`/`applying` so the preview updates without manual refresh.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "preparing" || status === "applying" ? 2000 : false;
    },
  });
}

export function useChangeItems(
  changeSetId: string | null,
  page: number,
  classification?: string,
) {
  return useQuery({
    queryKey: operationKeys.changeItems(
      changeSetId ?? "",
      page,
      classification,
    ),
    queryFn: async () => {
      const res = await apiClient<Envelope<ChangeItemsData>>(
        `/operations/change-sets/${changeSetId}/items`,
        {
          params: {
            page,
            pageSize: 20,
            ...(classification && { classification }),
          },
        },
      );
      return res.data;
    },
    enabled: !!changeSetId,
  });
}

// --- Mutations ---
interface PreparePreviewData {
  changeSet: { id: string; status: string };
  task: { id: string; statusUrl: string };
}

export function usePreparePreview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: string;
      scope: { type: string; id: string };
      parameters: Record<string, unknown>;
      expectedVersions: Record<string, number>;
    }) => {
      const res = await apiClient<Envelope<PreparePreviewData>>(
        "/operations/previews",
        {
          method: "POST",
          body: input,
        },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation"] });
    },
  });
}

export function useApplyChangeSet() {
  return useMutation({
    mutationFn: async (input: {
      changeSetId: string;
      version: number;
      idempotencyKey: string;
      confirmedWarningCodes?: string[];
      operatorReason?: string;
    }) => {
      const res = await apiClient<
        Envelope<{
          task: { id: string; statusUrl: string };
          recoveryPointId: string | null;
        }>
      >(`/operations/change-sets/${input.changeSetId}/apply`, {
        method: "POST",
        body: {
          confirmedWarningCodes: input.confirmedWarningCodes ?? [],
          operatorReason: input.operatorReason,
        },
        headers: {
          "Idempotency-Key": input.idempotencyKey,
          "If-Match": `"${input.version}"`,
        },
      });
      return res.data;
    },
  });
}

export function useCancelChangeSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { changeSetId: string; version: number }) => {
      const res = await apiClient<Envelope<unknown>>(
        `/operations/change-sets/${input.changeSetId}/cancel`,
        {
          method: "POST",
          headers: { "If-Match": `"${input.version}"` },
        },
      );
      return res.data;
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({
        queryKey: operationKeys.changeSet(input.changeSetId),
      });
    },
  });
}

/**
 * Target-scoped pending registry (FR-027). Each row/task badge keys by taskId
 * + target so unrelated rows never show pending.
 */
export function useTargetPending() {
  return {
    isPending: (taskId: string | null) => !!taskId,
  };
}
