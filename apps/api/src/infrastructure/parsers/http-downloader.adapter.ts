import type { ISourceDownloader, DownloadResult, DownloadOptions } from "@/domain/source-management";
import { downloadSource } from "./http-downloader";

export class HttpSourceDownloader implements ISourceDownloader {
  async download(url: string, options?: DownloadOptions): Promise<DownloadResult> {
    return downloadSource(url, options);
  }
}
