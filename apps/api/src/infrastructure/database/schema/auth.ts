/**
 * Compatibility barrel for better-auth schema imports.
 * The table definitions live in backend-core so device/token tables can use
 * real foreign keys without duplicating the user model.
 */
export { user, session, account, verification } from "@magi/backend-core";
