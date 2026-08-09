import { readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const outputRoot = resolve(process.argv[2] ?? "apps/worker/dist");
const aliasRequire = /require\((["'])@\/([^"']+)\1\)/g;

async function rewriteFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const rewritten = source.replace(aliasRequire, (_match, quote, aliasPath) => {
    let importPath = relative(resolve(filePath, ".."), resolve(outputRoot, aliasPath)).split(sep).join("/");
    if (!importPath.startsWith(".")) importPath = `./${importPath}`;
    return `require(${quote}${importPath}${quote})`;
  });

  if (rewritten !== source) await writeFile(filePath, rewritten);
}

async function rewriteDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) await rewriteDirectory(entryPath);
    if (entry.isFile() && entry.name.endsWith(".js")) await rewriteFile(entryPath);
  }
}

await rewriteDirectory(outputRoot);
