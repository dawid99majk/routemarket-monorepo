/**
 * Rolka 1080×1920 z ffmpeg: sceny ze zdjęciem (powolny najazd kamery) i sceny
 * pełnoekranowe (dymek agenta, wezwanie do działania), cięte na twardo.
 *
 * Tekst jest osobną, przezroczystą warstwą nałożoną na ruchome zdjęcie — gdyby
 * był wtopiony w kadr, przybliżałby się razem z nim i drgał przy 30 kl./s.
 * Ścieżka dźwiękowa jest cicha celowo: muzykę z licencją dla serwisu dodaje się
 * w aplikacji Instagrama/TikToka przy publikacji, a „modna” muzyka wtopiona
 * w plik to najprostsza droga do wyciszenia albo zdjęcia rolki.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FPS = 30;
const W = 1080, H = 1920;

function ff(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
}

/** Scena ze zdjęciem: najazd kamery + nakładka z tekstem wjeżdżająca łagodnie. */
export function scenaZdjecie({ zdjecie, nakladka, sekundy, wyjscie, kierunek = 1, odRazu = false }) {
  const klatki = Math.round(sekundy * FPS);
  // Powiększenie do 2× przed zoompan usuwa drżenie przy małych krokach przybliżenia.
  const z = kierunek > 0 ? `1+0.07*on/${klatki}` : `1.07-0.07*on/${klatki}`;
  ff([
    '-i', zdjecie,
    '-loop', '1', '-t', String(sekundy), '-i', nakladka,
    '-filter_complex',
    `[0]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
    `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${klatki}:s=${W}x${H}:fps=${FPS}[t];` +
    `[1]format=rgba${odRazu ? '' : ',fade=in:st=0.12:d=0.35:alpha=1'}[o];[t][o]overlay=0:0:shortest=1,format=yuv420p[v]`,
    '-map', '[v]', '-frames:v', String(klatki), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', wyjscie,
  ]);
  return wyjscie;
}

/** Scena pełnoekranowa z gotowego PNG (bez ruchu, z krótkim wejściem). */
export function scenaPlansza({ obraz, sekundy, wyjscie }) {
  ff([
    '-loop', '1', '-t', String(sekundy), '-i', obraz,
    '-vf', `scale=${W}:${H},fade=in:st=0:d=0.25,format=yuv420p`,
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', wyjscie,
  ]);
  return wyjscie;
}

/** Sklejenie scen + cicha ścieżka audio (niektóre serwisy odrzucają wideo bez audio). */
export function sklej(sceny, wyjscie) {
  const lista = path.join(path.dirname(wyjscie), '.sceny.txt');
  fs.writeFileSync(lista, sceny.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  ff([
    '-f', 'concat', '-safe', '0', '-i', lista,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest',
    '-movflags', '+faststart', wyjscie,
  ]);
  fs.unlinkSync(lista);
  for (const s of sceny) fs.unlinkSync(s);
  return wyjscie;
}

export function dlugosc(plik) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', plik]).toString();
  return Number(out.trim());
}
