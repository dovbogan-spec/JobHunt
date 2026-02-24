import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import parquet from "parquetjs-lite";
import { putRunSnapshotParquet } from "./blob.js";
import { sha256Hash, stableStringify } from "./hash.js";

type SnapshotInputs = {
  userId: string;
  runId: string;
  snapshotVersion: number;
  profile: unknown;
  output: unknown;
};

export async function writeRunSnapshotParquet(params: SnapshotInputs) {
  const profileJson = stableStringify(params.profile);
  const outputJson = stableStringify(params.output);
  const profileHash = sha256Hash(profileJson);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "jobhunt-snapshot-"));
  const tmpFilePath = path.join(tmpDir, `snapshot-v${params.snapshotVersion}.parquet`);

  try {
    const schema = new parquet.ParquetSchema({
      user_id: { type: "UTF8" },
      run_id: { type: "UTF8" },
      snapshot_version: { type: "INT64" },
      profile_hash: { type: "UTF8" },
      output_hash: { type: "UTF8" },
      profile_json: { type: "UTF8" },
      output_json: { type: "UTF8" },
      written_at: { type: "TIMESTAMP_MILLIS" },
    });

    const writer = await parquet.ParquetWriter.openFile(schema, tmpFilePath);
    await writer.appendRow({
      user_id: params.userId,
      run_id: params.runId,
      snapshot_version: params.snapshotVersion,
      profile_hash: profileHash,
      output_hash: sha256Hash(outputJson),
      profile_json: profileJson,
      output_json: outputJson,
      written_at: new Date(),
    });
    await writer.close();

    const body = await readFile(tmpFilePath);
    const uploaded = await putRunSnapshotParquet(params.userId, params.runId, params.snapshotVersion, body);

    return {
      profileHash,
      parquetBlobPath: uploaded.pathname,
      artifactId: uploaded.artifactId,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
