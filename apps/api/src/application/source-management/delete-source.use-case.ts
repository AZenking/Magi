import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  IM3uSourceRepository,
  IXmltvSourceRepository,
} from "../../domain/source-management";

@Injectable()
export class DeleteSourceUseCase {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly m3uRepo: IM3uSourceRepository,
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly xmltvRepo: IXmltvSourceRepository,
  ) {}

  async execute(id: string, type: "m3u" | "xmltv"): Promise<void> {
    if (type === "m3u") {
      const deleted = await this.m3uRepo.delete(id);
      if (!deleted) throw new NotFoundException("M3U source not found");
      return;
    }
    await this.xmltvRepo.clearProgrammeBindings(id);
    const deleted = await this.xmltvRepo.delete(id);
    if (!deleted) throw new NotFoundException("XMLTV source not found");
  }
}
