import type { IM3uParser, M3uEntry } from "@/domain/channel-catalog";
import { parseM3U, generateChannelIdentity } from "./m3u-parser";

export class M3uParserAdapter implements IM3uParser {
  parse(raw: string): M3uEntry[] {
    return parseM3U(raw);
  }

  generateChannelIdentity(sourceId: string, entry: M3uEntry): string {
    return generateChannelIdentity(sourceId, entry);
  }
}
