import { LoginForm as ProLoginForm, ProFormText } from "@ant-design/pro-components";
import type { ProFormInstance } from "@ant-design/pro-components";

export type LoginFormValues = {
  username: string;
  password: string;
};

type LoginFormProps = {
  onFinish: (values: LoginFormValues) => Promise<void> | void;
  pending: boolean;
  errorMessage?: string | null;
  formRef?: React.MutableRefObject<ProFormInstance<LoginFormValues> | undefined>;
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
    <ProLoginForm<LoginFormValues>
      formRef={formRef as never}
      onFinish={async (values) => {
        await onFinish(values);
        // Login errors are surfaced via `errorMessage`; never auto-close.
        return false;
      }}
      onValuesChange={onValuesChange as never}
      submitter={{
        searchConfig: { submitText: "登录" },
        submitButtonProps: { loading: pending, block: true },
      }}
      message={errorMessage ? errorMessage : false}
      title={false}
      subTitle={false}
    >
      <ProFormText
        name="username"
        placeholder="admin"
        fieldProps={{ autoComplete: "username" }}
        rules={[{ required: true, message: "请输入用户名" }]}
      />
      <ProFormText.Password
        name="password"
        placeholder="密码"
        fieldProps={{ autoComplete: "current-password" }}
        rules={[{ required: true, message: "请输入密码" }]}
      />
    </ProLoginForm>
  );
}
