import { RouteRequirements } from '../src/types/index.js';

async function run() {
  console.log('--- Rozpoczynam smoke test API Route Builder v2 ---');
  
  const badReq: RouteRequirements = {
    route_type: 'hiking',
    region: 'Tatry, Polska',
    start_point: 'Kuznice, Zakopane',
    end_point: null,
    loop: false,
    difficulty: 'hard',
    surface_preferences: [], avoid: [], ai_can_suggest_missing_points: true, language: 'pl'
  };

  const API_URL = 'http://127.0.0.1:8081';
  
  try {
    console.log('1. Tworzenie projektu...');
    const projRes = await fetch(API_URL + '/route-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badReq)
    });
    const proj = await projRes.json();
    console.log('Zapisano projekt:', proj.id);

    console.log('2. Tworzenie joba...');
    const jobRes = await fetch(API_URL + '/route-projects/' + proj.id + '/jobs', {
      method: 'POST'
    });
    const job = await jobRes.json();
    
    console.log('Stan joba po utworzeniu:', job.status, job.error_code);
    
    if (job.status === 'waiting_for_user' && job.error_code === 'missing_end_or_loop_permission') {
      console.log('SUKCES: System poprawnie zablokowal generowanie i oczekuje na decyzje uzytkownika.');
    } else {
      console.error('BLAD: System nie wykryl brakujacych danych w walidacji.');
    }

  } catch (e) {
    console.error('Blad testu:', e);
  }
}

run();
