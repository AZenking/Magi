import { Alert, Button, Form, Input } from "antd";
import type { FormInstance } from "antd";

export type LoginFormValues = {
  username: string;
  password: string;
};

type LoginFormProps = {
  onFinish: (values: LoginFormValues) => Promise<void> | void;
  pending: boolean;
  errorMessage?: string | null;
  form?: FormInstance<LoginFormValues>;
  onValuesChange?: (changed: Partial<LoginFormValues>, all: LoginFormValues) => void;
};

export function LoginForm({ onFinish, pending, errorMessage, form, onValuesChange }: LoginFormProps) {
  return (
    <Form<LoginFormValues>
      name="login"
      layout="vertical"
      onFinish={onFinish}
      onValuesChange={onValuesChange}
      disabled={pending}
      form={form}
      autoComplete="on"
    >
      {errorMessage ? (
        <Form.Item>
          <Alert type="error" showIcon title={errorMessage} banner />
        </Form.Item>
      ) : null}
      <Form.Item
        name="username"
        label="用户名"
        rules={[{ required: true, message: "请输入用户名" }]}
      >
        <Input autoComplete="username" placeholder="admin" />
      </Form.Item>
      <Form.Item
        name="password"
        label="密码"
        rules={[{ required: true, message: "请输入密码" }]}
      >
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={pending}>
          登录
        </Button>
      </Form.Item>
    </Form>
  );
}

