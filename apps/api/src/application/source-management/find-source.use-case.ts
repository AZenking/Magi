import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  IM3uSourceRepository,
  IXmltvSourceRepository,
  M3uSource,
  XmltvSource,
} from "../../domain/source-management";
import type { SourceType } from "../../domain/source-management";

export type AnySource = M3uSource | XmltvSource;

@Injectable()
export class FindSourceUseCase {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly m3uRepo: IM3uSourceRepository,
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly xmltvRepo: IXmltvSourceRepository,
  ) {}

  async execute(id: string, type: SourceType): Promise<AnySource> {
    if (type === "m3u") {
      const source = await this.m3uRepo.findById(id);
      if (!source) throw new NotFoundException("M3U source not found");
      return source;
    }
    const source = await this.xmltvRepo.findById(id);
    if (!source) throw new NotFoundException("XMLTV source not found");
    return source;
  }
}
