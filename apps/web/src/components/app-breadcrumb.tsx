import { Breadcrumb } from "antd";
import { Link, useLocation } from "@tanstack/react-router";

const LABELS: Record<string, string> = {
  dashboard: "仪表盘",
  sources: "源",
  m3u: "M3U",
  xmltv: "EPG/XMLTV",
  channels: "频道",
  programmes: "节目单",
  "epg-matching": "EPG 匹配",
  tasks: "任务",
};

type AppBreadcrumbProps = {
  /** Tail key for the last item (e.g., channelId, taskId). If omitted, last segment is rendered as text. */
  lastLabel?: string;
};

export function AppBreadcrumb({ lastLabel }: AppBreadcrumbProps) {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const items = segments.map((seg, idx) => {
    const isLast = idx === segments.length - 1;
    const path = "/" + segments.slice(0, idx + 1).join("/");
    const resolvedLabel =
      LABELS[seg] ?? (isLast && lastLabel ? lastLabel : seg);

    if (isLast) {
      return { title: resolvedLabel };
    }
    return {
      title: <Link to={path}>{resolvedLabel}</Link>,
    };
  });

  return <Breadcrumb items={items} />;
}
