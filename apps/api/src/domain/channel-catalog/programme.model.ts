export interface Programme {
  id: string;
  sourceId: string;
  xmltvChannelId: string;
  title: string | null;
  subTitle: string | null;
  desc: string | null;
  category: string | null;
  startAt: Date;
  stopAt: Date;
  createdAt: Date;
}

export class ProgrammeModel {
  constructor(private readonly programme: Programme) {}

  conflictsWith(other: Programme): boolean {
    return (
      this.programme.xmltvChannelId === other.xmltvChannelId &&
      this.programme.startAt < other.stopAt &&
      this.programme.stopAt > other.startAt
    );
  }

  canBeOverwritten(): boolean {
    return this.programme.stopAt < new Date();
  }

  isOngoing(): boolean {
    const now = new Date();
    return this.programme.startAt <= now && this.programme.stopAt > now;
  }

  toObject(): Programme {
    return { ...this.programme };
  }
}
