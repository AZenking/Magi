/**
 * GetSourceEffectivePolicyUseCase (T119).
 *
 * Returns the effective output policy for a source: enabled/participates/
 * role/priority/fallback + a human-readable summary (contracts/common.md
 * SourceEffectivePolicy).
 */
import type { IM3uSourceRepository, IXmltvSourceRepository } from "@/domain/source-management";

export interface SourceEffectivePolicyResult {
  enabled: boolean;
  participatesInOutput: boolean;
  role: string;
  priority: number;
  fallbackAllowed: boolean;
  summary: string;
}

export class GetSourceEffectivePolicyUseCase {
  constructor(
    private readonly m3uRepo: IM3uSourceRepository,
    private readonly xmltvRepo: IXmltvSourceRepository,
  ) {}

  async execute(sourceId: string): Promise<SourceEffectivePolicyResult | null> {
    const m3u = await this.m3uRepo.findById(sourceId);
    const xmltv = await this.xmltvRepo.findById(sourceId);
    const source = m3u ?? xmltv;
    if (!source) return null;

    const parts: string[] = [];
    if (source.enabled && source.participateInOutput) {
      parts.push(source.priority >= 100 ? "主输出来源" : "补充来源");
      parts.push(`优先级 ${source.priority}`);
      if (m3u?.allowFallback) parts.push("可作为备用");
    } else {
      parts.push(source.enabled ? "已启用但不参与输出" : "已禁用");
    }

    return {
      enabled: source.enabled,
      participatesInOutput: source.participateInOutput,
      role: source.role,
      priority: source.priority,
      fallbackAllowed: m3u?.allowFallback ?? false,
      summary: parts.join("；"),
    };
  }
}
