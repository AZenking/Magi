import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/auth`,
  plugins: [usernameClient()],
});

export const { signIn, signOut, useSession } = authClient;
