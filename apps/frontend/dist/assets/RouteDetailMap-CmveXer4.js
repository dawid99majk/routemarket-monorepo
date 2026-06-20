import{Z as z}from"./ui-vendor-BC3IF9Zn.js";import{h as m}from"./react-vendor-BBIu9AcQ.js";import{L as t}from"./leaflet-BDN9W5oC.js";import"./supabase-vendor-Btrk44BY.js";import"./leaflet-vendor-B7rZ0Bz1.js";function h(c,l){return t.divIcon({className:"route-endpoint-marker",html:`<div style="
      background:${c};
      color:white;
      border-radius:50%;
      width:28px;height:28px;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    ">${l}</div>`,iconSize:[28,28],iconAnchor:[14,14]})}function k(c,l="#6366f1"){let s="📍";const e=c.toLowerCase();return e.includes("start")?s="🏁":e.includes("meta")||e.includes("koniec")||e.includes("end")?s="🏆":e.includes("schronisko")?s="🏡":e.includes("szczyt")||e.includes("góra")||e.includes("giewont")||e.includes("kasprowy")?s="🏔️":e.includes("parking")?s="🅿️":e.includes("widok")||e.includes("punkt widokowy")?s="📷":(e.includes("restauracja")||e.includes("karczma")||e.includes("bar"))&&(s="🍽️"),t.divIcon({className:"route-poi-marker",html:`<div style="
      background:${l};
      color:white;
      border-radius:50%;
      width:30px;height:30px;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">${s}</div>`,iconSize:[30,30],iconAnchor:[15,15]})}h("#10b981","S");h("#ef4444","E");function L({track:c,places:l=[],className:s="",alternatives:e=null,selectedAlternativeId:g=null,onSelectAlternative:w}){const u=m.useRef(null),p=m.useRef(null);return m.useEffect(()=>{if(!u.current||c.length<2&&(!e||e.length===0))return;p.current&&(p.current.remove(),p.current=null);const r=t.map(u.current,{zoomControl:!0,scrollWheelZoom:!1,dragging:!0,maxZoom:15});t.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',maxZoom:17,noWrap:!0}).addTo(r);let f=t.latLngBounds([]);if(e&&e.length>0)e.forEach(o=>{const i=g===o.id,n=o.track.map(([a,E])=>t.latLng(a,E)),b=t.polyline(n,{color:o.color||"#6366f1",weight:i?6:3,opacity:i?1:.45,lineCap:"round",lineJoin:"round",interactive:!0}).addTo(r);w&&b.on("click",()=>{w(o.id)}),f.extend(n),i&&o.pois&&o.pois.length>0&&o.pois.forEach(a=>{t.marker([a.lat,a.lng],{icon:k(a.name,o.color)}).addTo(r).bindPopup(`<b>${a.name}</b><br/><span style="color:${o.color};font-weight:bold;">${o.name}</span>`)})});else{const o=c.map(([i,n])=>t.latLng(i,n));t.polyline(o,{color:"#6366f1",weight:4,opacity:.9,lineCap:"round",lineJoin:"round"}).addTo(r),f.extend(o)}let d=c,x="#6366f1";if(e&&e.length>0){const o=e.find(i=>i.id===g)||e[0];d=o.track,x=o.color}if(d&&d.length>=2){const o=d[0],i=d[d.length-1];t.marker([o[0],o[1]],{icon:h(x,"S")}).addTo(r).bindPopup("Start"),t.marker([i[0],i[1]],{icon:h("#dc2626","E")}).addTo(r).bindPopup("End"),l&&l.length>0&&l.forEach(n=>{const b=Math.abs(n.lat-o[0])<1e-4&&Math.abs(n.lng-o[1])<1e-4,a=Math.abs(n.lat-i[0])<1e-4&&Math.abs(n.lng-i[1])<1e-4;!b&&!a&&t.marker([n.lat,n.lng],{icon:k(n.name,x)}).addTo(r).bindPopup(`<b>${n.name}</b>`)})}f.isValid()&&r.fitBounds(f,{padding:[40,40],maxZoom:13,animate:!1}),setTimeout(()=>r.invalidateSize(!1),50);const y=o=>o.preventDefault();return u.current.addEventListener("contextmenu",y),p.current=r,()=>{u.current?.removeEventListener("contextmenu",y),r.remove(),p.current=null}},[c,l,e,g]),z.jsx("div",{ref:u,className:`w-full h-full ${s}`})}const R=m.memo(L);export{R as default};
