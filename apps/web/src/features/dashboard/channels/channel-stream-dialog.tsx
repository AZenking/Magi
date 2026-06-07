import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { PaginatedResponse, ChannelVo, SourceVo } from "@magi/types";
import { apiClient } from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@magi/ui/components/dialog";
import { Button } from "@magi/ui/components/button";
import { Input } from "@magi/ui/components/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@magi/ui/components/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@magi/ui/components/select";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@magi/ui/components/field";

const streamFormSchema = z.object({
  streamUrl: z.string().min(1, "请输入播放地址").url("请输入有效的 URL"),
});

type StreamMode = "manual" | "picker";

interface ChannelStreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
  initialSourceChannelId?: string | null;
  initialM3uSourceId?: string | null;
  onSubmit: (data: { streamUrl: string; m3uSourceId?: string | null; sourceChannelId?: string | null }) => Promise<void>;
  title?: string;
  editing?: boolean;
}

export function ChannelStreamDialog({
  open,
  onOpenChange,
  initialUrl,
  initialSourceChannelId,
  initialM3uSourceId,
  onSubmit,
  title,
  editing,
}: ChannelStreamDialogProps) {
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<StreamMode>("manual");
  const [selectedSourceId, setSelectedSourceId] = useState(initialM3uSourceId ?? "");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(initialSourceChannelId ?? null);
  const [selectedChannelUrl, setSelectedChannelUrl] = useState(initialUrl ?? "");
  const debouncedPickerSearch = useDebouncedValue(pickerSearch);

  const form = useForm({
    defaultValues: {
      streamUrl: initialUrl ?? "",
    },
    validators: {
      onChangeAsync: streamFormSchema,
    },
    onSubmit: async ({ value }) => {
      setPending(true);
      try {
        await onSubmit({ streamUrl: value.streamUrl });
        toast.success("播放源已保存");
        onOpenChange(false);
      } catch (err) {
        toast.error("保存失败", {
          description: err instanceof Error ? err.message : "请稍后重试",
        });
      } finally {
        setPending(false);
      }
    },
  });

  // Picker submit: bypasses form validation, directly submits selected channel data
  async function handlePickerSubmit() {
    if (!selectedChannelId || !selectedChannelUrl) return;
    setPending(true);
    try {
      await onSubmit({
        streamUrl: selectedChannelUrl,
        sourceChannelId: selectedChannelId,
        m3uSourceId: selectedSourceId || null,
      });
      toast.success("播放源已保存");
      onOpenChange(false);
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    } finally {
      setPending(false);
    }
  }


  // M3U sources for picker
  const { data: sourcesData } = useQuery({
    queryKey: ["sources", "m3u", "picker"],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<SourceVo> }>("/sources", {
        params: { type: "m3u", pageSize: 100 },
      }),
    enabled: open,
  });

  const m3uSources = sourcesData?.data?.items ?? [];

  // Raw channels for picker
  const { data: channelsData } = useQuery({
    queryKey: ["raw-channels", "picker", selectedSourceId, debouncedPickerSearch],
    queryFn: () =>
      apiClient<{ success: boolean; data: PaginatedResponse<ChannelVo> }>("/channels", {
        params: {
          sourceId: selectedSourceId || undefined,
          pageSize: 50,
          search: debouncedPickerSearch || undefined,
        },
      }),
    enabled: open && mode === "picker",
  });

  const pickerChannels = channelsData?.data?.items ?? [];

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setMode("manual");
      setSelectedSourceId("");
      setPickerSearch("");
      setSelectedChannelId(null);
      setSelectedChannelUrl("");
      form.reset();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? "播放源"}</DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as StreamMode)}>
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1">手动输入</TabsTrigger>
            <TabsTrigger value="picker" className="flex-1">从原始频道选择</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.Field name="streamUrl">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid || undefined}>
                        <FieldLabel htmlFor="stream-url">播放地址</FieldLabel>
                        <Input
                          id="stream-url"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="https://..."
                          aria-invalid={isInvalid}
                          disabled={pending}
                          autoComplete="url"
                        />
                        {isInvalid && (
                          <FieldError>
                            {field.state.meta.errors[0] instanceof Error
                              ? field.state.meta.errors[0].message
                              : String(field.state.meta.errors[0] ?? "")}
                          </FieldError>
                        )}
                      </Field>
                    );
                  }}
                </form.Field>
              </FieldGroup>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
                  取消
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "保存中…" : "保存"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="picker" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Select
                  value={selectedSourceId}
                  onValueChange={(v) => {
                    setSelectedSourceId(v === "all" ? "" : v);
                    setSelectedChannelId(null);
                    setSelectedChannelUrl("");
                  }}
                >
                  <SelectTrigger className="flex-1" aria-label="M3U 源筛选">
                    <SelectValue placeholder="全部 M3U 源" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部 M3U 源</SelectItem>
                    {m3uSources.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="搜索频道…"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="flex-1"
                  autoComplete="off"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto rounded-md border">
                {pickerChannels.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">无频道数据</p>
                ) : (
                  pickerChannels.filter((c) => c.streamUrl).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors ${
                        selectedChannelId === c.id ? "bg-accent" : ""
                      }`}
                      onClick={() => {
                        setSelectedChannelId(c.id);
                        setSelectedChannelUrl(c.streamUrl!);
                      }}
                    >
                      {c.tvgLogo ? (
                        <img src={c.tvgLogo} alt="" className="h-5 w-5 rounded object-contain shrink-0" loading="lazy" />
                      ) : (
                        <div className="h-5 w-5 rounded bg-muted shrink-0" />
                      )}
                      <span className="font-medium truncate">{c.displayName}</span>
                      {c.groupTitle && (
                        <span className="text-xs text-muted-foreground truncate">{c.groupTitle}</span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {selectedChannelId && (
                <p className="text-xs text-muted-foreground">
                  已选择：{pickerChannels.find((c) => c.id === selectedChannelId)?.displayName ?? ""}
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={pending || !selectedChannelId || !selectedChannelUrl}
                  onClick={handlePickerSubmit}
                >
                  {pending ? "保存中…" : "确认选择"}
                </Button>
              </DialogFooter>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
