/**
 * Smoke Test for Route Builder API v2 - GPX Bypass Flow
 * Usage: node smoke-test-gpx.js [API_URL]
 */

const API_BASE = process.argv[2] || 'http://localhost:8081';

const MOCK_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Antigravity Test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Giewont Loop GPX</name>
    <trkseg>
      <trkpt lat="49.2501" lon="19.9802"></trkpt>
      <trkpt lat="49.2550" lon="19.9820"></trkpt>
      <trkpt lat="49.2600" lon="19.9850"></trkpt>
      <trkpt lat="49.2620" lon="19.9870"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

async function runTest() {
  console.log(`Starting GPX smoke test against ${API_BASE}...`);

  try {
    console.log('Step 1: Health check...');
    const hRes = await fetch(`${API_BASE}/health`);
    if (!hRes.ok) throw new Error(`Health check failed: ${hRes.status}`);
    const health = await hRes.json();
    console.log('OK Health:', health.version);

    console.log('Step 2: Create draft project...');
    const pRes = await fetch(`${API_BASE}/route-projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route_type: 'hiking',
        region: 'Trasa GPX',
        start_point: 'Temp GPX Start',
        loop: false,
        distance_target_km: 1,
        difficulty: 'moderate'
      })
    });
    if (!pRes.ok) throw new Error(`Create project failed: ${pRes.status} ${await pRes.text()}`);
    const project = await pRes.json();
    console.log('OK Draft Project created:', project.id);

    console.log('Step 3: Upload GPX file content...');
    const gpxRes = await fetch(`${API_BASE}/route-projects/${project.id}/gpx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/gpx+xml' },
      body: MOCK_GPX
    });
    if (!gpxRes.ok) throw new Error(`GPX upload failed: ${gpxRes.status} ${await gpxRes.text()}`);
    const summary = await gpxRes.json();
    console.log('OK GPX parsed. Stats:', {
      distance_km: summary.distance_km,
      points_count: summary.points_count,
      track_length: summary.track.length
    });

    if (summary.points_count !== 4) {
      throw new Error(`Expected 4 points, got ${summary.points_count}`);
    }

    console.log('Step 4: Create job to generate AI guide...');
    const jRes = await fetch(`${API_BASE}/route-projects/${project.id}/jobs`, { method: 'POST' });
    if (!jRes.ok) throw new Error(`Create job failed: ${jRes.status} ${await jRes.text()}`);
    const job = await jRes.json();
    console.log('OK GPX Job started:', job.id, 'Status:', job.status, 'Progress:', job.progress);

    console.log('Step 5: Polling for ready status...');
    let attempts = 0;
    let finalJob = job;
    while (attempts < 15) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const sRes = await fetch(`${API_BASE}/route-projects/${project.id}/jobs/${job.id}`);
      if (!sRes.ok) throw new Error(`Job status failed: ${sRes.status} ${await sRes.text()}`);
      finalJob = await sRes.json();
      console.log(`... status: ${finalJob.status} (${finalJob.progress}%) - msg: ${finalJob.human_message || ''}`);
      if (finalJob.status === 'ready') break;
      if (finalJob.status === 'failed') throw new Error(`Job failed: ${finalJob.error_message}`);
      attempts++;
    }

    if (finalJob.status !== 'ready') throw new Error('Job timeout or didn\'t complete');
    console.log('OK GPX Job completed successfully!');

    console.log('Step 6: Fetch generated AI Guide report...');
    const rRes = await fetch(`${API_BASE}/route-projects/${project.id}/artifacts/report`);
    if (!rRes.ok) throw new Error(`Report fetch failed: ${rRes.status} ${await rRes.text()}`);
    const reportArtifact = await rRes.json();
    console.log('OK AI Guide report exists. Size:', reportArtifact.raw_data.length, 'chars');
    console.log('\nReport sample:\n', reportArtifact.raw_data.substring(0, 300) + '...\n');

    console.log('Step 7: Fetch places (POI)...');
    const plRes = await fetch(`${API_BASE}/route-projects/${project.id}/artifacts/places`);
    if (!plRes.ok) throw new Error(`Places fetch failed: ${plRes.status} ${await plRes.text()}`);
    const placesArtifact = await plRes.json();
    console.log('OK Places POI exist:', placesArtifact.content);

    console.log('\nGPX FLOW SMOKE TEST PASSED!');
  } catch (err) {
    console.error('\nGPX FLOW SMOKE TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTest();
