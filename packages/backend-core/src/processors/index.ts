export type { SyncProgress } from "./types";
export { EpgMatcher, type MatchType, type EpgMatchInput, type EpgMatchResult } from "./epg-matcher";
export {
  decideFailoverTarget,
  isFailoverAutomatic,
  shouldRestorePrimary,
  DEFAULT_FAILOVER_POLICY,
  type FailoverMode,
  type FailoverPolicyConfig,
  type StreamForFailover,
} from "./failover-policy";
