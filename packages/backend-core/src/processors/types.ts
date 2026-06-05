export interface SyncProgress {
  updateProgress(progress: number, currentStep: string): Promise<void>;
}
