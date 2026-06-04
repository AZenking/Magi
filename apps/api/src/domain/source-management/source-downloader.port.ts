export interface DownloadResult {
  content: string;
  statusCode: number;
}

export interface DownloadOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ISourceDownloader {
  download(url: string, options?: DownloadOptions): Promise<DownloadResult>;
}
