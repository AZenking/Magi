import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import type { SourceVo } from "@magi/types";
import { toast } from "sonner";

const sourceFormSchema = z.object({
  name: z.string().min(1, "请输入名称").max(255),
  url: z.string().refine(
    (u) => {
      if (!u) return false;
      try { new URL(u); } catch { return false; }
      return u.startsWith("http://") || u.startsWith("https://");
    },
    { message: "请输入有效的 URL（以 http:// 或 https:// 开头）" },
  ),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(9999).default(100),
  allowFallback: z.boolean().default(true),
  participateInOutput: z.boolean().default(true),
});

function getErrorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@magi/ui/components/dialog";
import { Button } from "@magi/ui/components/button";
import { Input } from "@magi/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@magi/ui/components/select";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@magi/ui/components/field";

interface SourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: SourceVo | null;
  sourceType: "m3u" | "xmltv";
  onSubmit: (data: { name: string; url: string; enabled: boolean; priority?: number; allowFallback?: boolean; participateInOutput?: boolean }) => Promise<void>;
}

export function SourceFormDialog({
  open,
  onOpenChange,
  source,
  sourceType,
  onSubmit,
}: SourceFormDialogProps) {
  const [pending, setPending] = useState(false);
  const isEdit = !!source;

  const form = useForm({
    defaultValues: {
      name: source?.name ?? "",
      url: source?.url ?? "",
      enabled: source?.enabled ?? true,
      priority: source?.priority ?? 100,
      allowFallback: source?.allowFallback ?? true,
      participateInOutput: source?.participateInOutput ?? true,
    },
    validators: {
      onChange: sourceFormSchema as never,
    },
    onSubmit: async ({ value }) => {
      setPending(true);
      try {
        await onSubmit({
          name: value.name,
          url: value.url,
          enabled: value.enabled,
          ...(sourceType === "m3u" ? {
            priority: value.priority,
            allowFallback: value.allowFallback,
            participateInOutput: value.participateInOutput,
          } : {}),
        });
        onOpenChange(false);
      } catch (err) {
        toast.error(isEdit ? "源更新失败" : "源添加失败", {
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
          <DialogTitle>{isEdit ? "编辑源" : "添加源"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor="source-name">名称</FieldLabel>
                    <Input
                      id="source-name"
                      name="name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      onClear={() => field.handleChange("")}
                      placeholder="源名称…"
                      aria-invalid={isInvalid}
                      disabled={pending}
                      autoComplete="off"
                    />
                    {isInvalid && (
                      <FieldError>
                        {getErrorMessage(field.state.meta.errors[0])}
                      </FieldError>
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <Field>
              <FieldLabel htmlFor="source-type">类型</FieldLabel>
              <Select value={sourceType} disabled>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="m3u">M3U</SelectItem>
                  <SelectItem value="xmltv">XMLTV</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <form.Field name="url">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor="source-url">URL</FieldLabel>
                    <Input
                      id="source-url"
                      name="url"
                      type="url"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      onClear={() => field.handleChange("")}
                      placeholder="https://example.com/source"
                      aria-invalid={isInvalid}
                      disabled={pending}
                      autoComplete="url"
                    />
                    {isInvalid && (
                      <FieldError>
                        {getErrorMessage(field.state.meta.errors[0])}
                      </FieldError>
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="enabled">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="source-enabled">状态</FieldLabel>
                  <Select
                    value={field.state.value ? "true" : "false"}
                    onValueChange={(v) => field.handleChange(v === "true")}
                    disabled={pending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">启用</SelectItem>
                      <SelectItem value="false">禁用</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>

            {sourceType === "m3u" && (
              <>
                <form.Field name="priority">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid || undefined}>
                        <FieldLabel htmlFor="source-priority">优先级</FieldLabel>
                        <Input
                          id="source-priority"
                          type="number"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(Number(e.target.value))}
                          onBlur={field.handleBlur}
                          placeholder="100"
                          aria-invalid={isInvalid}
                          disabled={pending}
                          min={0}
                          max={9999}
                        />
                        {isInvalid && (
                          <FieldError>
                            {getErrorMessage(field.state.meta.errors[0])}
                          </FieldError>
                        )}
                      </Field>
                    );
                  }}
                </form.Field>

                <form.Field name="participateInOutput">
                  {(field) => (
                    <Field>
                      <FieldLabel>参与输出</FieldLabel>
                      <Select
                        value={field.state.value ? "true" : "false"}
                        onValueChange={(v) => field.handleChange(v === "true")}
                        disabled={pending}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">是</SelectItem>
                          <SelectItem value="false">否</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>

                <form.Field name="allowFallback">
                  {(field) => (
                    <Field>
                      <FieldLabel>允许作为备选源</FieldLabel>
                      <Select
                        value={field.state.value ? "true" : "false"}
                        onValueChange={(v) => field.handleChange(v === "true")}
                        disabled={pending}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">是</SelectItem>
                          <SelectItem value="false">否</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>
              </>
            )}
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
