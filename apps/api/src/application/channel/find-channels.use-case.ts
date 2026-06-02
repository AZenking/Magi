import { Injectable } from "@nestjs/common";

@Injectable()
export class FindChannelsUseCase {
  async execute(query: { page: number; pageSize: number }): Promise<unknown> {
    // TODO: implement business logic
    return null;
  }
}
