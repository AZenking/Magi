export interface Programme {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  start: Date;
  stop: Date;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ProgrammeModel {
  constructor(private readonly programme: Programme) {}

  conflictsWith(other: Programme): boolean {
    return (
      this.programme.channelId === other.channelId &&
      this.programme.start < other.stop &&
      this.programme.stop > other.start
    );
  }

  canBeOverwritten(): boolean {
    return this.programme.stop < new Date();
  }
}
