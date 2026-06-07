import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import type { CanonicalChannelVo } from "@magi/types";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@magi/ui/components/dialog";
import { Button } from "@magi/ui/components/button";
import { Input } from "@magi/ui/components/input";
import { Checkbox } from "@magi/ui/components/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@magi/ui/components/field";

const channelFormSchema = z.object({
  standardName: z.string().min(1, "请输入频道名称").max(255).nullable(),
  standardGroup: z.string().max(255).nullable(),
  standardLogo: z.string().max(1024).nullable(),
  channelNumber: z.number().int().min(0).nullable(),
  epgChannelId: z.string().max(255).nullable(),
  hidden: z.boolean(),
  starred: z.boolean(),
});

function getErrorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

interface ChannelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: CanonicalChannelVo;
  onSubmit: (data: {
    standardName?: string | null;
    standardGroup?: string | null;
    standardLogo?: string | null;
    channelNumber?: number | null;
    epgChannelId?: string | null;
    hidden?: boolean;
    starred?: boolean;
  }) => Promise<void>;
}

export function OutputChannelFormDialog({
  open,
  onOpenChange,
  channel,
  onSubmit,
}: ChannelFormDialogProps) {
  const [pending, setPending] = useState(false);

  const form = useForm({
    defaultValues: {
      standardName: channel.standardName ?? "",
      standardGroup: channel.standardGroup ?? "",
      standardLogo: channel.standardLogo ?? "",
      channelNumber: channel.channelNumber as number | undefined,
      epgChannelId: channel.epgChannelId ?? "",
      hidden: channel.hidden,
      starred: channel.starred,
    },
    validators: {
      onChangeAsync: channelFormSchema,
    },
    onSubmit: async ({ value }) => {
      setPending(true);
      try {
        await onSubmit({
          standardName: value.standardName || null,
          standardGroup: value.standardGroup || null,
          standardLogo: value.standardLogo || null,
          channelNumber: value.channelNumber ?? null,
          epgChannelId: value.epgChannelId || null,
          hidden: value.hidden,
          starred: value.starred,
        });
        toast.success("频道已更新");
        onOpenChange(false);
      } catch (err) {
        toast.error("更新失败", {
          description: err instanceof Error ? err.message : "请稍后重试",
        });
      } finally {
        setPending(false);
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑频道</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field name="standardName">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor="ch-name">频道名称</FieldLabel>
                    <Input
                      id="ch-name"
                      value={field.state.value ?? ""}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      onClear={() => field.handleChange("")}
                      placeholder="频道名称"
                      aria-invalid={isInvalid}
                      disabled={pending}
                      autoComplete="off"
                    />
                    {isInvalid && (
                      <FieldError>{getErrorMessage(field.state.meta.errors[0])}</FieldError>
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="standardGroup">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="ch-group">分组</FieldLabel>
                  <Input
                    id="ch-group"
                    value={field.state.value ?? ""}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    onClear={() => field.handleChange("")}
                    placeholder="分组名称"
                    disabled={pending}
                    autoComplete="off"
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="standardLogo">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="ch-logo">Logo URL</FieldLabel>
                  <Input
                    id="ch-logo"
                    value={field.state.value ?? ""}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    onClear={() => field.handleChange("")}
                    placeholder="https://..."
                    disabled={pending}
                    autoComplete="url"
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="epgChannelId">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="ch-epg">EPG Channel ID / tvg-id</FieldLabel>
                  <Input
                    id="ch-epg"
                    value={field.state.value ?? ""}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    onClear={() => field.handleChange("")}
                    placeholder="CCTV1"
                    disabled={pending}
                    autoComplete="off"
                  />
                </Field>
              )}
            </form.Field>

            <form.Field name="channelNumber">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="ch-number">频道号</FieldLabel>
                  <Input
                    id="ch-number"
                    type="number"
                    value={field.state.value ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      field.handleChange(v === "" ? undefined as unknown as number : parseInt(v, 10));
                    }}
                    onBlur={field.handleBlur}
                    placeholder="自动"
                    disabled={pending}
                    autoComplete="off"
                  />
                </Field>
              )}
            </form.Field>

            <div className="flex items-center gap-6">
              <form.Field name="hidden">
                {(field) => (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={field.state.value}
                      onCheckedChange={(v) => field.handleChange(v === true)}
                      disabled={pending}
                    />
                    <span className="text-sm">隐藏</span>
                  </label>
                )}
              </form.Field>

              <form.Field name="starred">
                {(field) => (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={field.state.value}
                      onCheckedChange={(v) => field.handleChange(v === true)}
                      disabled={pending}
                    />
                    <span className="text-sm">收藏</span>
                  </label>
                )}
              </form.Field>
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
