// Trace filters hook with URL sync (M18)
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type TraceFilters = {
  search: string;
  name: string;
  tags: string[];
  userId: string;
  model: string;
  status: string;
  minCost: string;
  maxCost: string;
  minLatency: string;
  maxLatency: string;
  orderBy: string;
  orderDirection: string;
};

const DEFAULT_FILTERS: TraceFilters = {
  search: "",
  name: "",
  tags: [],
  userId: "",
  model: "",
  status: "",
  minCost: "",
  maxCost: "",
  minLatency: "",
  maxLatency: "",
  orderBy: "timestamp",
  orderDirection: "desc",
};

export function useTraceFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<TraceFilters>(() => {
    return {
      search: searchParams.get("search") || "",
      name: searchParams.get("name") || "",
      tags: searchParams.get("tags")?.split(",").filter(Boolean) || [],
      userId: searchParams.get("userId") || "",
      model: searchParams.get("model") || "",
      status: searchParams.get("status") || "",
      minCost: searchParams.get("minCost") || "",
      maxCost: searchParams.get("maxCost") || "",
      minLatency: searchParams.get("minLatency") || "",
      maxLatency: searchParams.get("maxLatency") || "",
      orderBy: searchParams.get("orderBy") || "timestamp",
      orderDirection: searchParams.get("orderDirection") || "desc",
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (partial: Partial<TraceFilters>) => {
      const next = { ...filters, ...partial };
      const params = new URLSearchParams();

      if (next.search) params.set("search", next.search);
      if (next.name) params.set("name", next.name);
      if (next.tags.length > 0) params.set("tags", next.tags.join(","));
      if (next.userId) params.set("userId", next.userId);
      if (next.model) params.set("model", next.model);
      if (next.status) params.set("status", next.status);
      if (next.minCost) params.set("minCost", next.minCost);
      if (next.maxCost) params.set("maxCost", next.maxCost);
      if (next.minLatency) params.set("minLatency", next.minLatency);
      if (next.maxLatency) params.set("maxLatency", next.maxLatency);
      if (next.orderBy !== "timestamp") params.set("orderBy", next.orderBy);
      if (next.orderDirection !== "desc") params.set("orderDirection", next.orderDirection);

      setSearchParams(params);
    },
    [filters, setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const toApiParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = {};
    if (filters.search) params.search = filters.search;
    if (filters.name) params.name = filters.name;
    if (filters.tags.length > 0) params.tags = filters.tags.join(",");
    if (filters.userId) params.userId = filters.userId;
    if (filters.model) params.model = filters.model;
    if (filters.status) params.status = filters.status;
    if (filters.minCost) params.minCost = filters.minCost;
    if (filters.maxCost) params.maxCost = filters.maxCost;
    if (filters.minLatency) params.minLatency = filters.minLatency;
    if (filters.maxLatency) params.maxLatency = filters.maxLatency;
    params.orderBy = filters.orderBy;
    params.orderDirection = filters.orderDirection;
    return params;
  }, [filters]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== "" ||
      filters.name !== "" ||
      filters.tags.length > 0 ||
      filters.userId !== "" ||
      filters.model !== "" ||
      filters.status !== "" ||
      filters.minCost !== "" ||
      filters.maxCost !== "" ||
      filters.minLatency !== "" ||
      filters.maxLatency !== ""
    );
  }, [filters]);

  return {
    filters,
    setFilters,
    clearFilters,
    toApiParams,
    hasActiveFilters,
  };
}
