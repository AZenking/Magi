/**
 * FindAuditEventsUseCase (T098).
 *
 * Queries audit events with filters. Detail never returns credentials.
 */
import type { IAuditRepository } from "@/domain/audit";
import type { AuditResult } from "@/domain/audit";

export interface FindAuditEventsParams {
  page: number;
  pageSize: number;
  action?: string;
  result?: AuditResult;
  targetType?: string;
  targetId?: string;
  taskId?: string;
  from?: Date;
  to?: Date;
}

export class FindAuditEventsUseCase {
  constructor(private readonly auditRepo: IAuditRepository) {}

  async execute(params: FindAuditEventsParams) {
    return this.auditRepo.findAll(params);
  }

  async findOne(id: string) {
    return this.auditRepo.findById(id);
  }
}
