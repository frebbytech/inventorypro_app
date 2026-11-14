import React, { createContext, useContext } from "react";
import { useAuth } from "./AuthProvider";
import type { InventoryProApiClient } from "./client";
import { demoDataAdapter } from "./demoAdapter";

const ApiClientContext = createContext<InventoryProApiClient>(demoDataAdapter);

export function ApiProvider({
  client,
  children,
}: {
  client?: InventoryProApiClient;
  children: React.ReactNode;
}) {
  const { apiClient } = useAuth();
  const activeClient = client ?? apiClient;

  return (
    <ApiClientContext.Provider value={activeClient}>
      {children}
    </ApiClientContext.Provider>
  );
}

export function useApiClient(): InventoryProApiClient {
  return useContext(ApiClientContext);
}
