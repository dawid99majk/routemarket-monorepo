import React, { useMemo } from 'react';

export function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in km
}

export function ElevationProfile({ coordinates }: { coordinates: number[][] }) {
  if (!coordinates || coordinates.length < 2) return null;

  const { points, minEle, maxEle, totalDist } = useMemo(() => {
    let totalDist = 0;
    const points: { dist: number; ele: number }[] = [];
    for (let i = 0; i < coordinates.length; i++) {
      const [lng, lat, ele] = coordinates[i];
      if (i > 0) {
        const [pLng, pLat] = coordinates[i-1];
        totalDist += getHaversineDistance(pLat, pLng, lat, lng);
      }
      points.push({ dist: totalDist, ele: ele || 0 });
    }
    const minEle = Math.min(...points.map(p => p.ele));
    const maxEle = Math.max(...points.map(p => p.ele));
    return { points, minEle, maxEle, totalDist };
  }, [coordinates]);

  const eleRange = Math.max(maxEle - minEle, 10);
  
  const pathData = points.map((p, i) => {
    const x = totalDist > 0 ? (p.dist / totalDist) * 100 : 0;
    const y = 40 - ((p.ele - minEle) / eleRange) * 40;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  
  const polygonData = `${pathData} L 100 40 L 0 40 Z`;

  return (
    <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
      <h3 className="font-bold text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
        Profil wysokościowy
      </h3>
      <div className="relative w-full h-24 mt-3">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <polygon points={polygonData.replace(/M|L/g, '')} className="fill-emerald-100/50" />
          <path d={pathData} fill="none" className="stroke-emerald-500" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute top-0 left-0 text-[10px] font-semibold text-slate-400 -translate-y-4 bg-white/80 px-1 rounded">{Math.round(maxEle)} m</div>
        <div className="absolute bottom-0 left-0 text-[10px] font-semibold text-slate-400 translate-y-4 bg-white/80 px-1 rounded">{Math.round(minEle)} m</div>
      </div>
      <div className="flex justify-between text-[10px] font-medium text-slate-400 mt-3 pt-2 border-t border-slate-200/50">
        <span>Przewyższenie: <strong className="text-slate-600">{Math.round(maxEle - minEle)}m</strong></span>
        <span>Dystans: <strong className="text-slate-600">{totalDist.toFixed(1)}km</strong></span>
      </div>
    </div>
  );
}
