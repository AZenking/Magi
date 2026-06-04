import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  IM3uSourceRepository,
  IXmltvSourceRepository,
  M3uUpdateData,
  XmltvUpdateData,
  M3uSource,
  XmltvSource,
} from "../../domain/source-management";
import type { UpdateSource } from "@magi/types";

export type UpdatedSource = M3uSource | XmltvSource;

@Injectable()
export class UpdateSourceUseCase {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly m3uRepo: IM3uSourceRepository,
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly xmltvRepo: IXmltvSourceRepository,
  ) {}

  async execute(
    id: string,
    type: "m3u" | "xmltv",
    data: UpdateSource,
  ): Promise<UpdatedSource> {
    if (type === "m3u") {
      const result = await this.m3uRepo.update(id, data as M3uUpdateData);
      if (!result) throw new NotFoundException("M3U source not found");
      return result;
    }
    const result = await this.xmltvRepo.update(id, data as XmltvUpdateData);
    if (!result) throw new NotFoundException("XMLTV source not found");
    return result;
  }
}
