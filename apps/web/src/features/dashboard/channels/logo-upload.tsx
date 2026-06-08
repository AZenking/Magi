import { useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/services/api";
import { Button } from "@magi/ui/components/button";

interface LogoUploadProps {
  currentLogo: string | null;
  channelId: string;
  onLogoChange: (url: string) => void;
}

export function LogoUpload({ currentLogo, channelId, onLogoChange }: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("图片大小不能超过 2MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await apiClient<{ success: boolean; data: { standardLogo: string } }>(
        `/output/channels/${channelId}/logo`,
        { method: "POST", body: formData },
      );
      if (res.data?.standardLogo) {
        onLogoChange(res.data.standardLogo);
        toast.success("Logo 已更新");
      }
    } catch (err) {
      toast.error("上传失败", { description: (err as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      {currentLogo ? (
        <img src={currentLogo} alt="" className="h-10 w-10 rounded object-contain bg-muted" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          Logo
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? "上传中…" : currentLogo ? "更换" : "上传"}
      </Button>
    </div>
  );
}
