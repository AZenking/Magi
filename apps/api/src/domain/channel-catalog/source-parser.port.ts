// --- M3U Parser Port ---

export interface M3uEntry {
  displayName: string;
  tvgId: string;
  tvgName: string;
  tvgLogo: string;
  groupTitle: string;
  streamUrl: string;
}

export interface IM3uParser {
  parse(raw: string): M3uEntry[];
  generateChannelIdentity(sourceId: string, entry: M3uEntry): string;
}

// --- XMLTV Parser Port ---

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

export interface IXmltvParser {
  parse(xml: string): XmltvData;
  parseDate(dateStr: string): Date;
  isInEpgWindow(startStr: string, stopStr: string, pastDays?: number, futureDays?: number): boolean;
}
