import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      gcTime: 1000 * 60 * 10, // 10 min
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      networkMode: "online",
    },
  },
});

export const storeQueryKeys = {
  incidents: (storeId?: string) => ["incidents", storeId ?? "all"],
  tasks: (storeId?: string) => ["tasks", storeId ?? "all"],
  reports: (storeId?: string) => ["reports", storeId ?? "all"],
  stores: () => ["stores"],
  users: () => ["users"],
  groups: (storeId?: string) => ["groups", storeId ?? "all"],
};
