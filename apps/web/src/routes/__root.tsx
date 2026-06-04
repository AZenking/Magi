import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@magi/ui/components/sonner";
import { TooltipProvider } from "@magi/ui/components/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { queryClient } from "@/lib/query-client";
import appCss from "@magi/ui/globals.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MAGI - EPG Manager" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Outlet />
            </TooltipProvider>
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
          </QueryClientProvider>
        </ThemeProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}
