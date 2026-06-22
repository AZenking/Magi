import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { API_BASE } from "@/services/config";

export const authClient = createAuthClient({
  baseURL: `${API_BASE}/api/auth`,
  plugins: [usernameClient()],
});

export const { signIn, signOut, useSession } = authClient;
