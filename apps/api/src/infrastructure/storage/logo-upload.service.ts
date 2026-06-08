import { Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

@Injectable()
export class LogoUploadService {
  private readonly uploadDir = process.env.LOGO_UPLOAD_DIR ?? "/app/uploads/logos";

  async save(buffer: Buffer, mimetype: string): Promise<string> {
    await mkdir(this.uploadDir, { recursive: true });
    const ext = mimetype.split("/")[1] ?? "png";
    const filename = `${randomUUID()}.${ext}`;
    await writeFile(join(this.uploadDir, filename), buffer);
    return `/uploads/logos/${filename}`;
  }
}
