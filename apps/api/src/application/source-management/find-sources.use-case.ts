import { Inject, Injectable } from "@nestjs/common";
import type {
  IM3uSourceRepository,
  IXmltvSourceRepository,
  FindSourcesParams,
  M3uSource,
  XmltvSource,
} from "../../domain/source-management";
import type { SourceType } from "../../domain/source-management";

export interface FindSourcesResult {
  items: (M3uSource | XmltvSource)[];
  total: number;
}

@Injectable()
export class FindSourcesUseCase {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly m3uRepo: IM3uSourceRepository,
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly xmltvRepo: IXmltvSourceRepository,
  ) {}

  async execute(
    type: SourceType | undefined,
    params: FindSourcesParams,
  ): Promise<FindSourcesResult> {
    if (type === "m3u") {
      return this.m3uRepo.findPaginated(params);
    }
    if (type === "xmltv") {
      return this.xmltvRepo.findPaginated(params);
    }
    const [m3uResult, xmltvResult] = await Promise.all([
      this.m3uRepo.findPaginated(params),
      this.xmltvRepo.findPaginated(params),
    ]);
    return {
      items: [...m3uResult.items, ...xmltvResult.items],
      total: m3uResult.total + xmltvResult.total,
    };
  }
}
