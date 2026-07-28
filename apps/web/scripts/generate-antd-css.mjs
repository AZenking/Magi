import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractStyle } from "@ant-design/static-style-extract";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(appRoot, "public", "antd.min.css");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, extractStyle(), "utf8");
