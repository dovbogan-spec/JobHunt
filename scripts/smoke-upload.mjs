/* eslint-disable no-console */
const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  const runRes = await fetch(`${baseUrl}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Smoke Upload Run',
      jdSourceType: 'paste',
      jdText: 'Sample JD text',
    }),
  });
  const runJson = await runRes.json();
  if (!runRes.ok) throw new Error(`Create run failed: ${JSON.stringify(runJson)}`);

  const runId = runJson.runId;
  const form = new FormData();
  form.append('file', new Blob(['Senior Engineer at Example Co'], { type: 'text/plain' }), 'experience.txt');

  const uploadRes = await fetch(`${baseUrl}/api/runs/${runId}/upload`, {
    method: 'POST',
    body: form,
  });
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(`Upload failed: ${JSON.stringify(uploadJson)}`);

  const runDetail = await fetch(`${baseUrl}/api/runs/${runId}`).then((r) => r.json());
  if (!runDetail?.run?.experience_text) {
    throw new Error('experience_text was not persisted');
  }

  console.log(JSON.stringify({ ok: true, runId, upload: uploadJson }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
