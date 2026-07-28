import { Flex, Typography, theme } from "antd";
import type { ReactNode } from "react";

type PageStackProps = {
  children: ReactNode;
};

export function PageStack({ children }: PageStackProps) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={token.marginLG} style={{ minWidth: 0 }}>
      {children}
    </Flex>
  );
}

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const { token } = theme.useToken();
  return (
    <Flex align="center" justify="space-between" wrap gap={token.marginSM}>
      <Flex vertical gap={token.marginXXS}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {description && (
          <Typography.Text type="secondary">{description}</Typography.Text>
        )}
      </Flex>
      {actions}
    </Flex>
  );
}

export function FilterBar({ children }: PageStackProps) {
  const { token } = theme.useToken();
  return (
    <Flex align="center" wrap gap={token.marginSM}>
      {children}
    </Flex>
  );
}
