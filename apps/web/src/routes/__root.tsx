import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import { StyleProvider } from "@ant-design/cssinjs";
import zhCN from "antd/locale/zh_CN";
import { lazy } from "react";
import "@/styles/global.css";

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : () => null;
import { queryClient } from "@/lib/query-client";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MAGI - EPG Manager" },
    ],
    links: [{ rel: "stylesheet", href: "/antd.min.css" }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        <StyleProvider>
          <ConfigProvider locale={zhCN}>
            <App>
              <QueryClientProvider client={queryClient}>
                <Outlet />
                <ReactQueryDevtools
                  initialIsOpen={false}
                  buttonPosition="bottom-left"
                />
              </QueryClientProvider>
            </App>
          </ConfigProvider>
        </StyleProvider>
        <Scripts />
      </body>
    </html>
  );
}
