/**
 * UpdateChangeDecisionsUseCase (T036).
 *
 * Records operator decisions (selected/candidate/lock) on change items.
 * Only a `ready` change set accepts decisions; conflict items require a valid
 * decision before they can be selected (contracts/operation-previews.md PATCH).
 *
 * Uses If-Match on the change-set version for optimistic concurrency.
 */
import { ConflictException } from "@nestjs/common";
import type { IOperationChangeSetRepository } from "@/domain/operation-safety";
import { OperationChangeSetRepository } from "@/infrastructure/database/operation-change-set.repository";
import type { OperationDecision } from "@magi/types";

export interface UpdateDecisionsInput {
  readonly changeSetId: string;
  readonly expectedVersion: number;
  readonly decisions: readonly OperationDecision[];
}

export class UpdateChangeDecisionsUseCase {
  constructor(
    private readonly changeSets: IOperationChangeSetRepository,
    private readonly itemRepo: OperationChangeSetRepository,
  ) {}

  async execute(input: UpdateDecisionsInput): Promise<{ version: number }> {
    const cs = await this.changeSets.findById(input.changeSetId);
    if (!cs)
      throw new ConflictException({ code: "resource-not-found", status: 404 });
    if (cs.status !== "ready") {
      throw new ConflictException({
        code: "invalid-state-transition",
        title: "Change set is not ready",
        status: 409,
      });
    }
    if (cs.version !== input.expectedVersion) {
      throw new ConflictException({
        code: "stale-resource",
        title: "Change set version changed",
        status: 412,
        currentVersion: cs.version,
      });
    }

    // Production repository implementations persist item decisions and bump
    // the parent token in one transaction. This prevents a concurrent edit or
    // a failed item write from leaving a half-updated change set.
    const updated =
      typeof this.itemRepo.updateDecisionsAndBumpVersion === "function"
        ? await this.itemRepo.updateDecisionsAndBumpVersion(
            input.changeSetId,
            cs.version,
            input.decisions.map((decision) => ({
              itemId: decision.itemId,
              selected: decision.selected,
              decision,
            })),
          )
        : await (async () => {
            for (const decision of input.decisions) {
              await this.itemRepo.updateItemSelection(
                decision.itemId,
                decision.selected,
                decision,
              );
            }
            return this.changeSets.updateStatus(
              input.changeSetId,
              "ready",
              cs.version,
            );
          })();
    if (!updated) {
      throw new ConflictException({
        code: "stale-resource",
        status: 412,
        currentVersion: cs.version,
      });
    }
    return { version: updated.version };
  }
}
