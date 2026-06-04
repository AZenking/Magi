export type MatchType = "manual" | "tvg-id" | "tvg-name" | "display-name" | "fuzzy" | "conflict";

export interface MatchCandidate {
  xmltvChannelId: string;
  xmltvDisplayName: string;
  matchType: MatchType;
  confidence: number;
}

export interface EpgMatchInput {
  channelTvgId: string | null;
  channelTvgName: string | null;
  channelDisplayName: string;
  manualEpgChannelId: string | null;
  xmltvChannels: Array<{ id: string; displayName: string }>;
}

export interface EpgMatchResult {
  matched: boolean;
  xmltvChannelId: string | null;
  matchType: MatchType | null;
  confidence: number;
  candidates: MatchCandidate[];
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[\s\-_\.]+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const setA = new Set(na.split(""));
  const setB = new Set(nb.split(""));
  let intersect = 0;
  for (const c of setA) {
    if (setB.has(c)) intersect++;
  }
  return intersect / (setA.size + setB.size - intersect);
}

export class EpgMatcher {
  private readonly FUZZY_THRESHOLD = 0.6;

  match(input: EpgMatchInput): EpgMatchResult {
    const candidates: MatchCandidate[] = [];

    // 1. Manual override — highest priority
    if (input.manualEpgChannelId) {
      const ch = input.xmltvChannels.find((c) => c.id === input.manualEpgChannelId);
      if (ch) {
        return {
          matched: true,
          xmltvChannelId: ch.id,
          matchType: "manual",
          confidence: 1,
          candidates: [{ xmltvChannelId: ch.id, xmltvDisplayName: ch.displayName, matchType: "manual", confidence: 1 }],
        };
      }
    }

    // 2. TVG-ID match
    if (input.channelTvgId) {
      const ch = input.xmltvChannels.find(
        (c) => c.id === input.channelTvgId || normalize(c.id) === normalize(input.channelTvgId!),
      );
      if (ch) {
        candidates.push({ xmltvChannelId: ch.id, xmltvDisplayName: ch.displayName, matchType: "tvg-id", confidence: 1 });
      }
    }

    // 3. TVG-NAME match
    if (input.channelTvgName) {
      const matches = input.xmltvChannels.filter(
        (c) => normalize(c.displayName) === normalize(input.channelTvgName!),
      );
      for (const ch of matches) {
        if (!candidates.some((c) => c.xmltvChannelId === ch.id)) {
          candidates.push({ xmltvChannelId: ch.id, xmltvDisplayName: ch.displayName, matchType: "tvg-name", confidence: 0.95 });
        }
      }
    }

    // 4. Display-name exact match
    const displayNameMatches = input.xmltvChannels.filter(
      (c) => normalize(c.displayName) === normalize(input.channelDisplayName),
    );
    for (const ch of displayNameMatches) {
      if (!candidates.some((c) => c.xmltvChannelId === ch.id)) {
        candidates.push({ xmltvChannelId: ch.id, xmltvDisplayName: ch.displayName, matchType: "display-name", confidence: 0.9 });
      }
    }

    // 5. Fuzzy match
    for (const ch of input.xmltvChannels) {
      if (candidates.some((c) => c.xmltvChannelId === ch.id)) continue;
      const score = similarity(input.channelDisplayName, ch.displayName);
      if (score >= this.FUZZY_THRESHOLD) {
        candidates.push({ xmltvChannelId: ch.id, xmltvDisplayName: ch.displayName, matchType: "fuzzy", confidence: score });
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    if (candidates.length === 0) {
      return { matched: false, xmltvChannelId: null, matchType: null, confidence: 0, candidates: [] };
    }

    // If top candidate is high-confidence, use it; otherwise mark as conflict
    const best = candidates[0]!;
    const hasConflict = candidates.length > 1 && candidates[1]!.confidence >= best.confidence * 0.95;

    if (hasConflict) {
      return {
        matched: false,
        xmltvChannelId: null,
        matchType: "conflict",
        confidence: best.confidence,
        candidates,
      };
    }

    return {
      matched: true,
      xmltvChannelId: best.xmltvChannelId,
      matchType: best.matchType,
      confidence: best.confidence,
      candidates,
    };
  }
}
