import { Inject, Injectable } from "@nestjs/common";
import type { IEpgSourceRepository } from "../../domain/epg/epg.repository";
import type { EpgSource } from "../../domain/epg/epg.model";

export interface FindSourcesQuery {
  type?: string;
  search?: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

export interface FindSourcesResult {
  items: EpgSource[];
  total: number;
}

@Injectable()
export class FindSourcesUseCase {
  constructor(
    @Inject("EPG_SOURCE_REPOSITORY")
    private readonly repo: IEpgSourceRepository,
  ) {}

  async execute(query: FindSourcesQuery): Promise<FindSourcesResult> {
    return this.repo.findPaginated(query);
  }
}
