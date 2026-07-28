import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  List,
  Progress,
  Result,
  Row,
  Statistic,
  Tooltip,
  Typography,
  theme,
} from "antd";
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import type { IssueCard, OperationsSummaryVo } from "@magi/types";
import { apiClient } from "@/services/api";

function formatTimestamp(value: string | null): string {
  if (!value) return "尚未运行";
  try {
    return new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function freshnessTone(
  latest: string | null,
  thresholdMs: number,
): "success" | "warning" | undefined {
  if (!latest) return undefined;
  const age = Date.now() - new Date(latest).getTime();
  return age <= thresholdMs ? "success" : "warning";
}

/**
 * T123: operations dashboard summary. Pulls the server-approved read model
 * (contracts/common.md) and renders freshness, coverage, task anomaly and
 * issue cards. Issue `actionUrl`s are server-approved dashboard paths and
 * navigate via the typed router.
 */
export function OperationsSummary() {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard", "operations-summary"],
    queryFn: () =>
      apiClient<{ success: boolean; data: OperationsSummaryVo }>(
        "/dashboard/operations-summary",
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isError) {
    return (
      <Card title="运营摘要">
        <Result
          status="error"
          title="运营摘要加载失败"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              重试
            </Button>
          }
        />
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Row gutter={[token.marginMD, token.marginMD]}>
        {[0, 1, 2].map((i) => (
          <Col key={i} xs={24} sm={12} lg={8}>
            <Card loading />
          </Col>
        ))}
      </Row>
    );
  }

  const s = data.data;
  const dayMs = 24 * 60 * 60 * 1000;
  const issues = s.issues ?? [];

  return (
    <Flex vertical gap={token.marginMD}>
      <Row gutter={[token.marginMD, token.marginMD]}>
        <Col xs={24} sm={12} lg={8}>
          <Card title="数据新鲜度" styles={{ body: { padding: token.paddingMD } }}>
            <Flex vertical gap={token.marginSM}>
              <FreshnessRow
                label="最近 M3U 同步"
                value={s.latestM3uSyncAt}
                tone={freshnessTone(s.latestM3uSyncAt, dayMs)}
              />
              <FreshnessRow
                label="最近 XMLTV 同步"
                value={s.latestXmltvSyncAt}
                tone={freshnessTone(s.latestXmltvSyncAt, dayMs)}
              />
              <FreshnessRow
                label="最近线路检查"
                value={s.latestStreamCheckAt}
                tone={freshnessTone(s.latestStreamCheckAt, dayMs)}
              />
            </Flex>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card title="覆盖率" styles={{ body: { padding: token.paddingMD } }}>
            <Flex vertical gap={token.marginSM}>
              <CoverageBar label="EPG 覆盖率" ratio={s.epgCoverage} />
              <CoverageBar label="tvg-ID 覆盖率" ratio={s.tvgIdCoverage} />
              <CoverageBar label="线路可用率" ratio={s.streamAvailability} />
            </Flex>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card title="任务异常" styles={{ body: { padding: token.paddingMD } }}>
            <Row gutter={[token.marginSM, token.marginSM]}>
              <Col span={8}>
                <Statistic
                  title="运行中"
                  value={s.runningTaskCount}
                  styles={{ content: s.runningTaskCount > 0 ? { color: token.colorPrimary } : undefined }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="失败"
                  value={s.failedTaskCount}
                  styles={{ content: s.failedTaskCount > 0 ? { color: token.colorError } : undefined }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="过期源"
                  value={s.staleSources}
                  styles={{ content: s.staleSources > 0 ? { color: token.colorWarning } : undefined }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card
        title="待处理事项"
        extra={
          <Typography.Text type="secondary">
            {issues.length > 0 ? `${issues.length} 项需要关注` : "当前无阻塞项"}
          </Typography.Text>
        }
      >
        {issues.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="无待处理事项"
          />
        ) : (
          <List
            dataSource={issues}
            renderItem={(issue) => (
              <List.Item>
                <Flex
                  align="center"
                  justify="space-between"
                  gap={token.marginMD}
                  wrap
                  style={{ width: "100%" }}
                >
                  <Flex align="flex-start" gap={token.marginSM}>
                    <ExclamationCircleOutlined
                      style={{
                        color: token.colorWarning,
                        marginTop: token.marginXXS,
                      }}
                    />
                    <Flex vertical gap={token.marginXXS}>
                      <Flex align="center" gap={token.marginXS} wrap>
                        <Typography.Text strong>{issue.message}</Typography.Text>
                        <Typography.Text code>{issue.code}</Typography.Text>
                        {typeof issue.count === "number" && (
                          <Typography.Text type="secondary">
                            共 {issue.count} 项
                          </Typography.Text>
                        )}
                      </Flex>
                    </Flex>
                  </Flex>
                  <Button
                    type="link"
                    icon={<ArrowRightOutlined />}
                    onClick={() =>
                      navigate({ to: issue.actionUrl as never })
                    }
                  >
                    处理
                  </Button>
                </Flex>
              </List.Item>
            )}
          />
        )}
      </Card>
    </Flex>
  );
}

function FreshnessRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: "success" | "warning";
}) {
  const { token } = theme.useToken();
  const color =
    tone === "success"
      ? token.colorSuccess
      : tone === "warning"
        ? token.colorWarning
        : token.colorTextSecondary;
  return (
    <Flex align="center" gap={token.marginXS}>
      <ClockCircleOutlined style={{ color }} />
      <Typography.Text type="secondary" style={{ flex: 1 }}>
        {label}
      </Typography.Text>
      <Tooltip title={value ?? "尚未运行"}>
        <Typography.Text style={{ color }}>{formatTimestamp(value)}</Typography.Text>
      </Tooltip>
    </Flex>
  );
}

function CoverageBar({ label, ratio }: { label: string; ratio: number }) {
  const { token } = theme.useToken();
  const percent = Math.round(ratio * 100);
  const strokeColor =
    percent >= 80
      ? token.colorSuccess
      : percent >= 50
        ? token.colorWarning
        : token.colorError;
  return (
    <Flex vertical gap={token.marginXXS}>
      <Flex justify="space-between">
        <Typography.Text type="secondary">{label}</Typography.Text>
        <Typography.Text>{percent}%</Typography.Text>
      </Flex>
      <Progress
        percent={percent}
        strokeColor={strokeColor}
        showInfo={false}
        size="small"
      />
    </Flex>
  );
}

/**
 * Small standalone alert for surfacing a single high-severity issue inline at
 * the top of a page. Kept for callers that want a compact representation.
 */
export function OperationsSummaryBanner({ issues }: { issues: IssueCard[] }) {
  const top = issues[0];
  if (!top) return null;
  return (
    <Alert
      type="warning"
      showIcon
      title={top.message}
      description={
        <Typography.Text type="secondary">
          错误码：{top.code}
          {typeof top.count === "number" ? `（共 ${top.count} 项）` : ""}
        </Typography.Text>
      }
    />
  );
}
