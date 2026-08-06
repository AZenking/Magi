import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AccountClientListQuery,
  DeviceAuthorizationDecision,
  DeviceAuthorizationPreview,
  DeviceClient,
  DeviceClientPage,
  RenameDeviceClientRequest,
  RevokeDeviceClientResult,
} from "@magi/types";
import { apiClient } from "@/services/api";

type Envelope<T> = { success: true; data: T };

export const accountClientKeys = {
  all: ["account-device-clients"] as const,
  list: (query: AccountClientListQuery) =>
    [...accountClientKeys.all, query] as const,
};

export function useAccountDeviceClients(query: AccountClientListQuery) {
  return useQuery({
    queryKey: accountClientKeys.list(query),
    queryFn: () =>
      apiClient<Envelope<DeviceClientPage>>("/api/account/clients", {
        params: query,
      }),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
}

export function useRenameDeviceClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & RenameDeviceClientRequest) =>
      apiClient<Envelope<DeviceClient>>(`/api/account/clients/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: accountClientKeys.all }),
  });
}

export function useRevokeDeviceClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<Envelope<RevokeDeviceClientResult>>(
        `/api/account/clients/${id}/revoke`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: accountClientKeys.all }),
  });
}

export function useRestoreDeviceClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<Envelope<DeviceClient>>(`/api/account/clients/${id}/restore`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: accountClientKeys.all }),
  });
}

export function useAccountDeviceClient(id: string | null, enabled = true) {
  return useQuery({
    queryKey: [...accountClientKeys.all, "detail", id] as const,
    queryFn: () => apiClient<Envelope<DeviceClient>>(`/api/account/clients/${id}`),
    enabled: enabled && !!id,
    retry: false,
  });
}

export function useDeviceAuthorizationPreview(
  userCode: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["device-authorization-preview", userCode],
    queryFn: () =>
      apiClient<Envelope<DeviceAuthorizationPreview>>(
        `/api/account/device-authorizations/${encodeURIComponent(userCode)}`,
      ),
    enabled,
    retry: false,
  });
}

export function useApproveDeviceAuthorization() {
  return useMutation({
    mutationFn: ({
      userCode,
      displayName,
    }: {
      userCode: string;
      displayName: string;
    }) =>
      apiClient<Envelope<DeviceAuthorizationDecision>>(
        `/api/account/device-authorizations/${encodeURIComponent(userCode)}/approve`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: { displayName },
        },
      ),
  });
}

export function useDenyDeviceAuthorization() {
  return useMutation({
    mutationFn: (userCode: string) =>
      apiClient<Envelope<DeviceAuthorizationDecision>>(
        `/api/account/device-authorizations/${encodeURIComponent(userCode)}/deny`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      ),
  });
}
