import { Injectable } from "@nestjs/common";

@Injectable()
export class FindChannelsUseCase {
  async execute(_query: { page: number; pageSize: number }): Promise<unknown> {
    // TODO: implement business logic
    return null;
  }
}
