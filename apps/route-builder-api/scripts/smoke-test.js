/**
 * Smoke Test for Route Builder API v2
 * Usage: node smoke-test.js [API_URL]
 */

const API_BASE = process.argv[2] || 'http://localhost:8081';

async function runTest() {
  console.log(`Starting smoke test against ${API_BASE}...`);

  try {
    console.log('Step 1: Health check...');
    const hRes = await fetch(`${API_BASE}/health`);
    if (!hRes.ok) throw new Error(`Health check failed: ${hRes.status}`);
    const health = await hRes.json();
    console.log('OK Health:', health.version);

    console.log('Step 2: Create project...');
    const pRes = await fetch(`${API_BASE}/route-projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route_type: 'hiking',
        region: 'Tatry',
        start_point: 'Kuznice',
        loop: true,
        distance_target_km: 5,
        difficulty: 'moderate'
      })
    });
    if (!pRes.ok) throw new Error(`Create project failed: ${pRes.status} ${await pRes.text()}`);
    const project = await pRes.json();
    console.log('OK Project created:', project.id);

    console.log('Step 3: Create job...');
    const jRes = await fetch(`${API_BASE}/route-projects/${project.id}/jobs`, { method: 'POST' });
    if (!jRes.ok) throw new Error(`Create job failed: ${jRes.status} ${await jRes.text()}`);
    const job = await jRes.json();
    console.log('OK Job started:', job.id);

    console.log('Step 4: Polling for ready status...');
    let attempts = 0;
    let finalJob = job;
    while (attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const sRes = await fetch(`${API_BASE}/route-projects/${project.id}/jobs/${job.id}`);
      if (!sRes.ok) throw new Error(`Job status failed: ${sRes.status} ${await sRes.text()}`);
      finalJob = await sRes.json();
      console.log(`... status: ${finalJob.status} (${finalJob.progress}%)`);
      if (finalJob.status === 'ready') break;
      if (finalJob.status === 'failed') throw new Error(`Job failed: ${finalJob.error_message}`);
      attempts++;
    }

    if (finalJob.status !== 'ready') throw new Error('Job timeout');
    console.log('OK Job completed successfully');

    console.log('Step 5: Download GPX...');
    const gRes = await fetch(`${API_BASE}/route-projects/${project.id}/gpx`);
    if (!gRes.ok) throw new Error(`GPX download failed: ${gRes.status} ${await gRes.text()}`);
    const gpx = await gRes.text();
    if (!gpx.includes('<gpx')) throw new Error('Invalid GPX content');
    console.log('OK GPX downloaded and valid');

    console.log('\nSMOKE TEST PASSED');
  } catch (err) {
    console.error('\nSMOKE TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTest();
