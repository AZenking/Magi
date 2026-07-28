import { useRef, useState } from "react";
import { Avatar, Button, Flex, theme } from "antd";
import { useFeedback } from "@/lib/feedback";
import { apiClient } from "@/services/api";

interface LogoUploadProps {
  currentLogo: string | null;
  channelId: string;
  onLogoChange: (url: string) => void;
}

export function LogoUpload({
  currentLogo,
  channelId,
  onLogoChange,
}: LogoUploadProps) {
  const { token } = theme.useToken();
  const { message } = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      message.error("请选择图片文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error("图片大小不能超过 2MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await apiClient<{
        success: boolean;
        data: { standardLogo: string };
      }>(`/output/channels/${channelId}/logo`, {
        method: "POST",
        body: formData,
      });
      if (res.data?.standardLogo) {
        onLogoChange(res.data.standardLogo);
        message.success("Logo 已更新");
      }
    } catch (err) {
      message.error(`上传失败：${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Flex align="center" gap={token.marginXS}>
      {currentLogo ? (
        <Avatar shape="square" size={40} src={currentLogo} alt="频道 Logo" />
      ) : (
        <Avatar shape="square" size={40}>
          Logo
        </Avatar>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <Button
        size="small"
        onClick={() => inputRef.current?.click()}
        loading={uploading}
      >
        {uploading ? "上传中…" : currentLogo ? "更换" : "上传"}
      </Button>
    </Flex>
  );
}
