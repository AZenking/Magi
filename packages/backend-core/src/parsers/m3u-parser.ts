export interface M3uEntry {
  displayName: string;
  tvgId: string;
  tvgName: string;
  tvgLogo: string;
  groupTitle: string;
  streamUrl: string;
}

const ATTR_RE = /\b([\w-]+)="([^"]*)"/gi;

export function parseM3U(raw: string): M3uEntry[] {
  const lines = raw.split(/\r?\n/);
  const entries: M3uEntry[] = [];
  let current: Partial<M3uEntry> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      current = {};
      const attrs: Record<string, string> = {};
      let m: RegExpExecArray | null;
      ATTR_RE.lastIndex = 0;
      while ((m = ATTR_RE.exec(line)) !== null) {
        attrs[m[1]!.toLowerCase()] = m[2]!;
      }

      current.tvgId = attrs["tvg-id"] ?? "";
      current.tvgName = attrs["tvg-name"] ?? "";
      current.tvgLogo = attrs["tvg-logo"] ?? "";
      current.groupTitle = attrs["group-title"] ?? "";

      const commaIdx = line.lastIndexOf(",");
      if (commaIdx !== -1) {
        current.displayName = line.slice(commaIdx + 1).trim();
      }
    } else if (!line.startsWith("#") && current) {
      current.streamUrl = line;
      if (current.displayName === undefined) {
        current.displayName = current.tvgName || "";
      }
      if (current.displayName && current.streamUrl) {
        entries.push({
          displayName: current.displayName,
          tvgId: current.tvgId ?? "",
          tvgName: current.tvgName ?? "",
          tvgLogo: current.tvgLogo ?? "",
          groupTitle: current.groupTitle ?? "",
          streamUrl: current.streamUrl,
        });
      }
      current = null;
    }
  }

  return entries;
}

export function generateChannelIdentity(sourceId: string, entry: M3uEntry): string {
  if (entry.tvgId) {
    return `${sourceId}::tvg-id::${entry.tvgId}`;
  }
  if (entry.streamUrl) {
    return `${sourceId}::url::${entry.streamUrl}`;
  }
  const normalized = normalizeChannelName(entry.displayName);
  return `${sourceId}::name::${normalized}::${entry.groupTitle}`;
}

export function normalizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-_]+/g, " ")
    .trim();
}

export function computeMergeKey(channel: {
  tvgId: string | null;
  displayName: string;
  groupTitle: string | null;
}): string {
  if (channel.tvgId) {
    return `tvg:${channel.tvgId}`;
  }
  const name = normalizeChannelName(channel.displayName);
  const group = (channel.groupTitle ?? "").toLowerCase().trim();
  return `name:${name}::${group}`;
}
