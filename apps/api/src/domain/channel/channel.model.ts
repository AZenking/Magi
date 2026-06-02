export interface Channel {
  id: string;
  name: string;
  icon: string | null;
  url: string | null;
  status: string;
  epgSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ChannelModel {
  constructor(private readonly channel: Channel) {}

  canBeDeleted(): boolean {
    return this.channel.status !== "active";
  }

  isActive(): boolean {
    return this.channel.status === "active";
  }
}
