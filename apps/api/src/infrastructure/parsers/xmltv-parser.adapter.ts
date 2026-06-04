import type { IXmltvParser, XmltvData } from "@/domain/channel-catalog";
import { parseXMLTV, parseXmltvDate, isInEpgWindow } from "./xmltv-parser";

export class XmltvParserAdapter implements IXmltvParser {
  parse(xml: string): XmltvData {
    return parseXMLTV(xml);
  }

  parseDate(dateStr: string): Date {
    return parseXmltvDate(dateStr);
  }

  isInEpgWindow(startStr: string, stopStr: string, pastDays?: number, futureDays?: number): boolean {
    return isInEpgWindow(startStr, stopStr, pastDays, futureDays);
  }
}
