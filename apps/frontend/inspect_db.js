import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Read env file
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = 'http://213.165.94.18:8001';
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

let logContent = '';
function log(msg, ...args) {
  const line = msg + ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  logContent += line + '\n';
  console.log(line);
}

log('Supabase URL:', supabaseUrl);
log('Publishable Key:', supabaseKey ? supabaseKey.slice(0, 10) + '...' : 'none');

const supabase = createClient(supabaseUrl, supabaseKey);

const { data, error } = await supabase.from('atlas_projects').select('*').limit(1);
if (error) {
  log('Error fetching atlas_projects:', error);
} else {
  log('Success fetching atlas_projects! Rows count:', data.length);
  if (data.length > 0) {
    log('Keys in row:', Object.keys(data[0]));
  }
}

fs.writeFileSync('db_output.txt', logContent, 'utf8');
