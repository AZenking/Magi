import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  IM3uSourceRepository,
  IXmltvSourceRepository,
} from "../../domain/source-management";
import type { ICanonicalEpgBindingRepository } from "../../domain/output-composition";

@Injectable()
export class DeleteSourceUseCase {
  constructor(
    @Inject("M3U_SOURCE_REPOSITORY")
    private readonly m3uRepo: IM3uSourceRepository,
    @Inject("XMLTV_SOURCE_REPOSITORY")
    private readonly xmltvRepo: IXmltvSourceRepository,
    @Inject("CANONICAL_EPG_BINDING_REPOSITORY")
    private readonly epgBindingRepo: ICanonicalEpgBindingRepository,
  ) {}

  async execute(id: string, type: "m3u" | "xmltv"): Promise<void> {
    if (type === "m3u") {
      const deleted = await this.m3uRepo.delete(id);
      if (!deleted) throw new NotFoundException("M3U source not found");
      return;
    }
    if (await this.epgBindingRepo.hasBindingsForXmltvSource(id)) {
      throw new ConflictException({
        code: "xmltv-source-has-output-bindings",
        title: "请先重新绑定或解除关联的输出频道，再删除 XMLTV 来源",
        status: 409,
      });
    }
    await this.xmltvRepo.clearProgrammeBindings(id);
    const deleted = await this.xmltvRepo.delete(id);
    if (!deleted) throw new NotFoundException("XMLTV source not found");
  }
}
