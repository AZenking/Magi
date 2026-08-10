/**
 * FindOperationChangeSetUseCase (T036).
 *
 * Reads a change set + paginated items for the preview UI. Side-effect free.
 * (contracts/operation-previews.md: GET /operations/change-sets/{id} + /items)
 */
import type { IOperationChangeSetRepository } from "@/domain/operation-safety";
import type { OperationChangeSet } from "@/domain/operation-safety";
import { OperationChangeSetRepository } from "@/infrastructure/database/operation-change-set.repository";

export interface FindChangeSetResult {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly expiresAt: Date;
  readonly version: number;
  readonly operationFingerprint?: string;
  readonly baseVersions?: Record<string, number>;
  readonly snapshotId?: string | null;
  readonly sourceVersion?: number | null;
  readonly requiresConfirmation?: boolean;
  readonly anomalyClassification?: OperationChangeSet["anomalyClassification"];
  readonly summary?: Record<string, unknown>;
  readonly warnings?: { code: string; message: string }[];
  readonly blockers?: { code: string; message: string }[];
}

export interface FindChangeItemsParams {
  readonly changeSetId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly classification?: string;
}

export class FindOperationChangeSetUseCase {
  constructor(
    private readonly changeSets: IOperationChangeSetRepository,
    private readonly itemRepo: OperationChangeSetRepository,
  ) {}

  async findOne(id: string): Promise<FindChangeSetResult | null> {
    const cs = await this.changeSets.findById(id);
    if (!cs) return null;
    // Summary/warnings/blockers live only on the persistence row (written by
    // the prepare worker); merge them into the preview read model.
    const extras = await this.itemRepo.findSummaryById(id);
    return {
      id: cs.id,
      kind: cs.kind,
      status: cs.status,
      expiresAt: cs.expiresAt,
      version: cs.version,
      operationFingerprint: cs.inputFingerprint,
      baseVersions: cs.baseVersions ?? {},
      snapshotId: cs.snapshotId ?? null,
      sourceVersion: cs.sourceVersion ?? null,
      requiresConfirmation: cs.requiresConfirmation ?? false,
      anomalyClassification: cs.anomalyClassification ?? null,
      summary: extras?.summary ?? undefined,
      warnings: (extras?.warnings ??
        undefined) as FindChangeSetResult["warnings"],
      blockers: (extras?.blockers ??
        undefined) as FindChangeSetResult["blockers"],
    };
  }

  async findItems(params: FindChangeItemsParams): Promise<{
    items: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { items, total } = await this.itemRepo.findItems(params.changeSetId, {
      page: params.page,
      pageSize: params.pageSize,
      classification: params.classification,
    });
    // Map persistence rows to the wire VO shape (contracts/operation-previews.md):
    // stable `itemId`, never DB row internals.
    const vos = items.map((row) => ({
      itemId: row.id,
      action: row.action,
      classification: row.classification ?? undefined,
      selected: row.selected,
      confidence: row.confidence ?? null,
      reasonCode: row.reasonCode ?? undefined,
    }));
    return { items: vos, total, page: params.page, pageSize: params.pageSize };
  }
}
