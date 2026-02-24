import { deleteArtifactById, deleteArtifactPath } from "./blob.js";
import {
  clearExpiredRawData,
  deleteExpiredArtifacts,
  deleteExpiredSnapshots,
  eraseUserData,
  listUserBlobReferences,
  listUserRunArtifacts,
  listUserRuns,
  listUserSnapshots,
} from "./runsRepo.js";

function readTtlDays() {
  const raw = process.env.DATA_RETENTION_TTL_DAYS;
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

async function swallowNotFound(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (/404|not found|no such file/i.test(message)) return;
    throw error;
  }
}

function artifactIdFromRecord(data: Record<string, unknown>) {
  const value = data.artifactId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function runRetentionCleanup() {
  const ttlDays = readTtlDays();

  const [clearedRuns, deletedArtifacts, deletedSnapshots] = await Promise.all([
    clearExpiredRawData(ttlDays),
    deleteExpiredArtifacts(ttlDays),
    deleteExpiredSnapshots(ttlDays),
  ]);

  const artifactIds = deletedArtifacts
    .map((row) => artifactIdFromRecord(row.data ?? {}))
    .filter((value): value is string => Boolean(value));

  await Promise.all(artifactIds.map((artifactId) => swallowNotFound(deleteArtifactById(artifactId))));
  await Promise.all(
    deletedSnapshots.map((snapshot) =>
      swallowNotFound(deleteArtifactPath(snapshot.parquet_blob_path, process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local")),
    ),
  );

  return {
    ttlDays,
    clearedRuns: clearedRuns.length,
    deletedArtifacts: deletedArtifacts.length,
    deletedSnapshots: deletedSnapshots.length,
    deletedBlobArtifacts: artifactIds.length + deletedSnapshots.length,
  };
}

export async function exportUserData(userId: string) {
  const [runs, artifacts, snapshots] = await Promise.all([
    listUserRuns(userId),
    listUserRunArtifacts(userId),
    listUserSnapshots(userId),
  ]);

  return {
    userId,
    exportedAt: new Date().toISOString(),
    runs,
    artifacts,
    snapshots,
  };
}

export async function eraseUserDataAndBlobs(userId: string) {
  const refs = await listUserBlobReferences(userId);
  const artifactIds = [
    ...refs.runArtifactIds,
    ...refs.artifactRows
      .map((row) => artifactIdFromRecord(row.data ?? {}))
      .filter((value): value is string => Boolean(value)),
  ];

  await Promise.all(artifactIds.map((artifactId) => swallowNotFound(deleteArtifactById(artifactId))));
  await Promise.all(
    refs.snapshotPaths.map((pathname) =>
      swallowNotFound(deleteArtifactPath(pathname, process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local")),
    ),
  );

  const deletedRuns = await eraseUserData(userId);
  return {
    userId,
    deletedRuns: deletedRuns.length,
    deletedBlobArtifacts: artifactIds.length + refs.snapshotPaths.length,
  };
}
