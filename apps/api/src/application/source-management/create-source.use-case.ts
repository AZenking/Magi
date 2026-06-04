import { Inject, Injectable } from "@nestjs/common";
import type {
  IM3uSourceRepository,
  IXmltvSourceRepository,
  M3uSource,
  XmltvSource,
} from "../../domain/source-management";
import type { CreateSource } from "@magi/types";

export type CreatedSource = M3uSource | XmltvSource;

@Injectable()
export class CreateSourceUseCase {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly m3uRepo: IM3uSourceRepository,
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly xmltvRepo: IXmltvSourceRepository,
  ) {}

  async execute(data: CreateSource): Promise<CreatedSource> {
    if (data.type === "m3u") {
      return this.m3uRepo.create({
        name: data.name,
        url: data.url,
        enabled: data.enabled,
        role: data.role,
        priority: data.priority,
        participateInOutput: data.participateInOutput,
        allowFallback: data.allowFallback,
        headers: null,
      });
    }
    return this.xmltvRepo.create({
      name: data.name,
      url: data.url,
      enabled: data.enabled,
      role: data.role,
      priority: data.priority,
      participateInOutput: data.participateInOutput,
      headers: null,
    });
  }
}
