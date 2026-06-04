import { Inject, Injectable } from "@nestjs/common";
import type { IProgrammeRepository, Programme } from "@/domain/channel-catalog";

export interface FindProgrammesQuery {
  xmltvChannelId?: string;
  sourceId?: string;
  page: number;
  pageSize: number;
}

export interface FindProgrammesResult {
  items: Programme[];
  total: number;
}

@Injectable()
export class FindProgrammesUseCase {
  constructor(
    @Inject("PROGRAMME_REPOSITORY")
    private readonly programmeRepo: IProgrammeRepository,
  ) {}

  async execute(query: FindProgrammesQuery): Promise<FindProgrammesResult> {
    return this.programmeRepo.findAll(query);
  }
}
