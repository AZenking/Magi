import { App } from "antd";

export function useFeedback() {
  const { message, notification, modal } = App.useApp();
  return { message, notification, modal };
}
