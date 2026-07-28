import { Alert, Button, Form, Input } from "antd";
import type { FormInstance } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";

export type LoginFormValues = {
  username: string;
  password: string;
};

type LoginFormProps = {
  onFinish: (values: LoginFormValues) => Promise<void> | void;
  pending: boolean;
  errorMessage?: string | null;
  formRef?: React.MutableRefObject<FormInstance<LoginFormValues> | undefined>;
  onValuesChange?: (changed: Partial<LoginFormValues>, all: LoginFormValues) => void;
};

export function LoginForm({
  onFinish,
  pending,
  errorMessage,
  formRef,
  onValuesChange,
}: LoginFormProps) {
  return (
    <Form<LoginFormValues>
      className="magi-login-form"
      ref={formRef as never}
      layout="vertical"
      autoComplete="off"
      onFinish={onFinish}
      onValuesChange={onValuesChange}
    >
      {errorMessage && (
        <Alert
          className="magi-login-alert"
          type="error"
          title={errorMessage}
          showIcon
        />
      )}
      <Form.Item<LoginFormValues>
        name="username"
        label="用户名"
        rules={[{ required: true, message: "请输入用户名" }]}
      >
        <Input
          autoComplete="username"
          size="large"
          prefix={<UserOutlined />}
          placeholder="输入管理员用户名"
        />
      </Form.Item>
      <Form.Item<LoginFormValues>
        name="password"
        label="密码"
        rules={[{ required: true, message: "请输入密码" }]}
      >
        <Input.Password
          autoComplete="current-password"
          size="large"
          prefix={<LockOutlined />}
          placeholder="输入登录密码"
        />
      </Form.Item>
      <Button
        className="magi-login-submit"
        type="primary"
        htmlType="submit"
        loading={pending}
        block
        size="large"
      >
        登录
      </Button>
    </Form>
  );
}
