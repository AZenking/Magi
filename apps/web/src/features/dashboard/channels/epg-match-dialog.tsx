import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { apiClient } from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@magi/ui/components/dialog";
import { Button } from "@magi/ui/components/button";
import { Input } from "@magi/ui/components/input";
import type { PaginatedResponse, RawXmltvChannelVo } from "@magi/types";

interface EpgMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEpgChannelId: string | null;
  onSelect: (xmltvChannelId: string) => Promise<void>;
  onClear: () => Promise<void>;
  pending?: boolean;
}

export function EpgMatchDialog({
  open,
  onOpenChange,
  currentEpgChannelId,
  onSelect,
  onClear,
  pending,
}: EpgMatchDialogProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useQuery({
    queryKey: ["epg-channels", debouncedSearch, page],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<RawXmltvChannelVo> }>("/epg/channels", {
        params: { search: debouncedSearch || undefined, page, pageSize: 10 },
      }),
    enabled: open,
  });

  const candidates = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>EPG 频道匹配</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {currentEpgChannelId && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                当前绑定：<span className="font-mono font-medium">{currentEpgChannelId}</span>
              </span>
              <Button variant="outline" size="sm" onClick={onClear} disabled={pending}>
                清空绑定
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="搜索频道 ID 或名称…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              autoComplete="off"
            />
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">搜索中…</div>
          ) : candidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">无结果</div>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  onClick={() => onSelect(c.xmltvId)}
                  disabled={pending}
                >
                  <span className="font-mono">{c.xmltvId}</span>
                  <span className="text-muted-foreground">{c.displayName}</span>
                </button>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                下一页
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
