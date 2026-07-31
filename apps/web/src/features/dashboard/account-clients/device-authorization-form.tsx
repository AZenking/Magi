import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Result,
  Space,
  Typography,
} from "antd";
import { Link, useNavigate } from "@tanstack/react-router";
import { PageHeader, PageStack } from "@/components/page-layout";
import { useFeedback } from "@/lib/feedback";
import {
  useApproveDeviceAuthorization,
  useDeviceAuthorizationPreview,
  useDenyDeviceAuthorization,
} from "./client-queries";

export function normalizeUserCode(value: string) {
  return value
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
}

export function DeviceAuthorizationForm() {
  const navigate = useNavigate();
  const { message } = useFeedback();
  const [code, setCode] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [decisionOpen, setDecisionOpen] = useState(false);
  const preview = useDeviceAuthorizationPreview(
    submittedCode,
    submittedCode.length > 0,
  );
  const approve = useApproveDeviceAuthorization();
  const deny = useDenyDeviceAuthorization();

  useEffect(() => {
    if (preview.data?.data)
      setDisplayName(preview.data.data.suggestedName ?? "");
  }, [preview.data]);

  function lookup() {
    const normalized = normalizeUserCode(code);
    if (normalized.length === 8)
      setSubmittedCode(`${normalized.slice(0, 4)}-${normalized.slice(4)}`);
  }

  async function decide(kind: "approve" | "deny") {
    try {
      if (kind === "approve")
        await approve.mutateAsync({
          userCode: submittedCode,
          displayName: displayName.trim(),
        });
      else await deny.mutateAsync(submittedCode);
      setDecisionOpen(false);
      message.success(
        kind === "approve" ? "已批准，请返回电视" : "已拒绝该授权请求",
      );
      if (kind === "approve")
        void navigate({ to: "/dashboard/account/clients" });
    } catch {
      message.error("授权请求已不可用，请让电视重新获取授权码");
    }
  }

  const data = preview.data?.data;
  return (
    <PageStack>
      <PageHeader
        title="账户 · 客户端管理 · 绑定客户端"
        description="输入电视上显示的短码，核对设备摘要后批准绑定。"
        actions={
          <Link to="/dashboard/account/clients">
            <Button>返回客户端列表</Button>
          </Link>
        }
      />
      <Card>
        <Form layout="vertical" onFinish={lookup}>
          <Form.Item
            label="电视授权码"
            help="支持 XXXX-XXXX 或不带连字符的 8 位短码。"
          >
            <Space.Compact block>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="XXXX-XXXX"
                maxLength={9}
                autoFocus
              />
              <Button type="primary" htmlType="submit">
                查询设备
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
        {preview.isLoading ? (
          <Typography.Text>正在查询授权请求…</Typography.Text>
        ) : null}
        {preview.isError ? (
          <Alert
            type="error"
            showIcon
            title="授权码不可用，请在电视上重新获取"
          />
        ) : null}
        {data ? (
          <Card type="inner" title="确认设备" style={{ marginTop: 16 }}>
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
              <Typography.Paragraph>
                设备：{data.identitySummary}
                <br />
                平台：{data.platform} {data.platformVersion}
                <br />
                应用版本：{data.appVersion}
                <br />
                有效期至：{new Date(data.expiresAt).toLocaleString()}
              </Typography.Paragraph>
              <Form layout="vertical">
                <Form.Item label="客户端名称" required>
                  <Input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={64}
                  />
                </Form.Item>
                <Space>
                  <Button
                    type="primary"
                    disabled={
                      !displayName.trim() || approve.isPending || deny.isPending
                    }
                    onClick={() => setDecisionOpen(true)}
                  >
                    批准绑定
                  </Button>
                  <Button
                    danger
                    disabled={approve.isPending || deny.isPending}
                    onClick={() => void decide("deny")}
                  >
                    拒绝
                  </Button>
                </Space>
              </Form>
            </Space>
          </Card>
        ) : null}
      </Card>
      <Modal
        title="确认绑定客户端"
        open={decisionOpen}
        onCancel={() => setDecisionOpen(false)}
        onOk={() => void decide("approve")}
        okText="批准绑定"
        cancelText="取消"
        confirmLoading={approve.isPending}
        destroyOnHidden
        mask={{ closable: false }}
      >
        <Typography.Paragraph>
          批准后，电视将获得仅绑定到该账户的访问权限。设备不会看到你的账户密码或其他客户端秘密。
        </Typography.Paragraph>
      </Modal>
      {approve.isSuccess ? (
        <Result
          status="success"
          title="已批准，请返回电视"
          extra={
            <Link to="/dashboard/account/clients">
              <Button>查看客户端列表</Button>
            </Link>
          }
        />
      ) : null}
    </PageStack>
  );
}
