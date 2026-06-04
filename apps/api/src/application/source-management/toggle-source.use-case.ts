import { Inject, Injectable } from "@nestjs/common";
import type {
  IM3uSourceRepository,
  IXmltvSourceRepository,
} from "../../domain/source-management";

@Injectable()
export class ToggleSourceUseCase {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly m3uRepo: IM3uSourceRepository,
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly xmltvRepo: IXmltvSourceRepository,
  ) {}

  async execute(id: string, type: "m3u" | "xmltv", enabled: boolean): Promise<void> {
    if (type === "m3u") {
      await this.m3uRepo.update(id, { enabled });
      return;
    }
    await this.xmltvRepo.update(id, { enabled });
  }
}
