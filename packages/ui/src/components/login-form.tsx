import { cn } from "#lib/utils"
import { Button } from "#components/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "#components/field"
import { Input } from "#components/input"

type LoginFormProps = React.ComponentProps<"form"> & {
  pending?: boolean
}

export function LoginForm({
  className,
  pending = false,
  ...props
}: LoginFormProps) {
  return (
    <form className={cn("flex flex-col gap-6", className)} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">登录到 MAGI</h1>
          <p className="text-sm text-balance text-muted-foreground">
            输入用户名和密码以进入管理后台
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="username">用户名</FieldLabel>
          <Input
            id="username"
            name="username"
            type="text"
            placeholder="admin"
            required
            autoComplete="username"
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">密码</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={pending}
          />
        </Field>
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? "登录中..." : "登录"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
