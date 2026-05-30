import { RouteRequirements } from '../src/types/index.js';

async function run() {
  console.log('--- Rozpoczynam smoke test Geocoding (Prompt 4) ---');
  
  const goodReq: RouteRequirements = {
    route_type: 'hiking',
    region: 'Tatry, Polska',
    start_point: 'Kuznice, Zakopane',
    end_point: 'Morskie Oko',
    loop: false,
    difficulty: 'hard',
    surface_preferences: [], avoid: [], ai_can_suggest_missing_points: false, language: 'pl'
  };

  const API_URL = 'http://127.0.0.1:8081';
  
  try {
    const projRes = await fetch(API_URL + '/route-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(goodReq)
    });
    const proj = await projRes.json();

    const jobRes = await fetch(API_URL + '/route-projects/' + proj.id + '/jobs', {
      method: 'POST'
    });
    const job = await jobRes.json();
    
    console.log('Stan joba na starcie:', job.status, job.current_step);
    
    // Czekamy 2 sekundy na zakonczenie geokodowania
    await new Promise(r => setTimeout(r, 2000));
    
    const checkRes = await fetch(API_URL + '/route-projects/' + proj.id + '/jobs/' + job.id);
    const finalJob = await checkRes.json();
    
    console.log('Stan joba po asynchronicznym geokodowaniu:', finalJob.status, finalJob.current_step);
    
    if (finalJob.status === 'ready' && finalJob.current_step === 'completed') {
      console.log('SUKCES: Mock Geokodowania zostal wykonany i job przeszedl w stan ready.');
    } else {
      console.error('BLAD: Job nie przeszedl do konca procesu.', finalJob);
    }

  } catch (e) {
    console.error('Blad testu:', e);
  }
}

run();
