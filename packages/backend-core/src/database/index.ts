export { createDb } from "./connection";
export * from "./schema";
// Namespace re-export so API/Worker/tests consume the schema as a single
// `schema` object (e.g. `import { schema } from "@magi/backend-core"`).
// This is the single source of truth mandated by constitution II / T017/T019.
export * as schema from "./schema";
