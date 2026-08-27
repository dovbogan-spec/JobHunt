import type { LlmProvider } from "../config/modelDefinitions";

export type ConnectivityStatus = "idle" | "testing" | "success" | "error" | "stale";

export type ConnectionRecord = {
  status: ConnectivityStatus;
  requestedModel?: string;
  resolvedModel?: string;
  connectedAt?: string;
  errorCode?: string;
  endpoint?: string;
};

export type ConnectionRecords = Partial<Record<LlmProvider, ConnectionRecord>>;

export function connectionLabel(record: ConnectionRecord | undefined) {
  if (record?.status === "success" && record.resolvedModel) return `Connected: ${record.resolvedModel}`;
  if (record?.status === "error") return "Not connected";
  if (record?.status === "testing") return "Testing…";
  return "";
}

export function markChangedConnectionStale(
  records: ConnectionRecords,
  provider: LlmProvider,
  model: string,
  endpoint: string,
): ConnectionRecords {
  const record = records[provider];
  if (!record || record.status !== "success") return records;
  if (record.requestedModel === model.trim() && (record.endpoint || "") === endpoint.trim()) return records;
  return { ...records, [provider]: { status: "stale" } };
}

export function modelForRequest(requestedModel: string, record: ConnectionRecord | undefined) {
  return record?.status === "success" && record.resolvedModel ? record.resolvedModel : requestedModel;
}
