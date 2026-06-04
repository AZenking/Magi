export interface XmltvChannel {
  id: string;
  displayName: string;
  icon: string;
}

export interface XmltvProgramme {
  channel: string;
  title: string;
  subTitle: string;
  desc: string;
  category: string;
  start: string;
  stop: string;
}

export interface XmltvData {
  channels: XmltvChannel[];
  programmes: XmltvProgramme[];
}

export function parseXMLTV(xml: string): XmltvData {
  const channels = parseChannels(xml);
  const programmes = parseProgrammes(xml);
  return { channels, programmes };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractText(parent: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = parent.match(re);
  return m ? decodeEntities(m[1]!.trim()) : "";
}

function parseChannels(xml: string): XmltvChannel[] {
  const result: XmltvChannel[] = [];
  const re = /<channel\s+id="([^"]*)">([\s\S]*?)<\/channel>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[2]!;
    const displayName = extractText(body, "display-name");
    const iconMatch = body.match(/<icon\s+src="([^"]*)"/i);
    result.push({
      id: m[1]!,
      displayName,
      icon: iconMatch?.[1] ?? "",
    });
  }
  return result;
}

function parseProgrammes(xml: string): XmltvProgramme[] {
  const result: XmltvProgramme[] = [];
  const re = /<programme\s+([\s\S]*?)>([\s\S]*?)<\/programme>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1]!;
    const body = m[2]!;
    const channelMatch = attrs.match(/channel="([^"]*)"/);
    const startMatch = attrs.match(/start="([^"]*)"/);
    const stopMatch = attrs.match(/stop="([^"]*)"/);
    if (!channelMatch || !startMatch || !stopMatch) continue;
    result.push({
      channel: channelMatch[1]!,
      title: extractText(body, "title"),
      subTitle: extractText(body, "sub-title"),
      desc: extractText(body, "desc"),
      category: extractText(body, "category"),
      start: startMatch[1]!,
      stop: stopMatch[1]!,
    });
  }
  return result;
}

export function parseXmltvDate(dateStr: string): Date {
  const cleaned = dateStr.replace(/\s*[+\-]\d{4}\s*$/, "").trim();
  const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/);
  if (!match) return new Date(0);
  const [, y, mo, d, h, mi, s = "00"] = match;
  return new Date(
    Date.UTC(
      parseInt(y!, 10),
      parseInt(mo!, 10) - 1,
      parseInt(d!, 10),
      parseInt(h!, 10),
      parseInt(mi!, 10),
      parseInt(s!, 10),
    ),
  );
}

export function isInEpgWindow(
  startStr: string,
  stopStr: string,
  pastDays = 1,
  futureDays = 7,
): boolean {
  const start = parseXmltvDate(startStr);
  const stop = parseXmltvDate(stopStr);
  const now = Date.now();
  const windowStart = now - pastDays * 86400000;
  const windowEnd = now + futureDays * 86400000;
  return start.getTime() < windowEnd && stop.getTime() > windowStart;
}
