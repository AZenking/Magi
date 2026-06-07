import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const FFPROBE_TIMEOUT_MS = 12_000;
const FFPROBE_AV_TIMEOUT_US = 8_000_000;

export interface ProbeResult {
  ok: boolean;
  responseTime: number;
  error?: string;
  codec?: string;
  format?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  bitrate?: number;
}

export async function probeStream(url: string): Promise<ProbeResult> {
  const start = Date.now();

  const args = [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    "-show_error",
    "-timeout", String(FFPROBE_AV_TIMEOUT_US),
    "-rw_timeout", String(FFPROBE_AV_TIMEOUT_US),
    "-user_agent", "MAGI-HealthCheck/1.0",
    "-i", url,
  ];

  try {
    const { stdout } = await execFileAsync("ffprobe", args, {
      timeout: FFPROBE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      killSignal: "SIGKILL",
      windowsHide: true,
    });

    const responseTime = Date.now() - start;
    const data = JSON.parse(stdout) as {
      streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }>;
      format?: { format_name?: string; bit_rate?: string };
    };

    const streams = data.streams;
    if (!streams || streams.length === 0) {
      return { ok: false, responseTime, error: "No media streams found" };
    }

    const video = streams.find((s) => s.codec_type === "video");
    const audio = streams.find((s) => s.codec_type === "audio");
    const primaryCodec = video?.codec_name ?? audio?.codec_name;

    let frameRate: number | undefined;
    if (video?.r_frame_rate) {
      const parts = video.r_frame_rate.split("/");
      if (parts.length === 2) {
        const num = parseFloat(parts[0]!);
        const den = parseFloat(parts[1]!);
        if (den > 0) frameRate = Math.round((num / den) * 100) / 100;
      }
    }

    let bitrate: number | undefined;
    if (data.format?.bit_rate) {
      const bps = parseInt(data.format.bit_rate, 10);
      if (!isNaN(bps)) bitrate = Math.round(bps / 1000);
    }

    return {
      ok: true,
      responseTime,
      codec: primaryCodec,
      format: data.format?.format_name,
      width: video?.width,
      height: video?.height,
      frameRate,
      bitrate,
    };
  } catch (err) {
    const responseTime = Date.now() - start;
    const nodeErr = err as Error & { killed?: boolean; stderr?: string };

    if (nodeErr.killed) {
      return { ok: false, responseTime, error: "Probe timed out" };
    }

    const message = nodeErr.stderr?.trim() || nodeErr.message || "Probe failed";
    return { ok: false, responseTime, error: message.slice(0, 500) };
  }
}
