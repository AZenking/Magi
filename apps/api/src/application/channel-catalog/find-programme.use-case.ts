import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { IProgrammeRepository, Programme } from "@/domain/channel-catalog";

@Injectable()
export class FindProgrammeUseCase {
  constructor(
    @Inject("PROGRAMME_REPOSITORY")
    private readonly programmeRepo: IProgrammeRepository,
  ) {}

  async execute(id: string): Promise<Programme> {
    const programme = await this.programmeRepo.findById(id);
    if (!programme) throw new NotFoundException("Programme not found");
    return programme;
  }
}
