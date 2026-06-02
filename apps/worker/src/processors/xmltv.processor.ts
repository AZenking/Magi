import type { Logger } from "@magi/utils";

export class XmltvProcessor {
  constructor(private readonly logger: Logger) {}

  async process(jobData: unknown): Promise<void> {
    // TODO: implement XMLTV parsing and import
    this.logger.info("Processing XMLTV import", { data: jobData });
  }
}
