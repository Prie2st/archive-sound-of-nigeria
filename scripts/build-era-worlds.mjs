/** Original geometric exhibition graphics, never archival photographs. Reproducible local atlas. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ERAS } from '../src/data/eras.ts';
import { ERA_ATLAS, ERA_VISUALS } from '../src/data/eraVisuals.ts';
const out = path.resolve('public/textures/environment');
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&apos;');
const rect = (x,y,w,h,fill,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const line = (x1,y1,x2,y2,c,w=1,extra='') => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${c}" stroke-width="${w}" ${extra}/>`;
const circle = (x,y,r,c,extra='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${extra}/>`;
const text = (s,x,y,size,c,extra='') => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${c}" ${extra}>${esc(s)}</text>`;
const wrap = (s,limit) => { const lines=[]; let row=''; for(const word of s.split(' ')) { if(row && (row+' '+word).length>limit) { lines.push(row); row=word; } else row+=(row?' ':'')+word; } if(row) lines.push(row); return lines; };
const motifs = {
  weave: (p) => {
    let s='';
    for(let y=298;y<482;y+=28) for(let x=18;x<480;x+=36) s+=`<path d="M${x} ${y+14}l18 -14 18 14 -18 14z" fill="none" stroke="${(x+y)%3?p.accent:p.paper}" stroke-width="3"/>`;
    for(let x=24;x<490;x+=10) s+=line(x,484,x,500,p.accent,2);
    s+=`<path d="M212 326Q256 355 300 326L281 451Q256 432 231 451Z" fill="${p.paper}"/><ellipse cx="256" cy="327" rx="45" ry="12" fill="${p.accent}"/>`;
    for(let i=0;i<7;i++) s+=line(214+i*14,330,232+i*8,449,p.primary,2);
    return s;
  },
  shellac: (p) => {
    let s=rect(24,291,464,189,p.paper);
    for(let y=309;y<473;y+=21) s+=line(36,y,476,y,p.accent,1,'opacity=".28"');
    s+=circle(315,390,86,'#171615');
    for(let r=35;r<83;r+=7) s+=circle(315,390,r,'none',`stroke="#938372" stroke-width=".7"`);
    s+=circle(315,390,28,p.accent)+circle(315,390,3,p.paper);
    s+=text('78',315,398,22,p.secondary,'text-anchor="middle"')+text('CAT.',47,334,17,p.secondary)+text('A02',47,359,31,p.secondary)+line(47,375,171,375,p.accent,2)+line(47,386,150,386,p.accent,2);
    return s;
  },
  brass: (p) => {
    let s='';
    for(let i=0;i<6;i++) s+=`<path d="M${36+i*28} 490V${398-i*16}a${220-i*28} ${120-i*14} 0 0 1 ${440-i*56} 0V490" fill="none" stroke="${i%2?p.accent:p.secondary}" stroke-width="12"/>`;
    s+=`<path d="M80 435L337 347l77 -40 -6 89 -68 -28 -237 90Z" fill="${p.accent}"/>`+circle(406,352,34,p.primary,`stroke="${p.paper}" stroke-width="5"`);
    return s;
  },
  print: (p) => {
    let s='';
    for(let i=0;i<12;i++) { const a=i*Math.PI/6; s+=`<path d="M256 395L${256+290*Math.cos(a)} ${395+290*Math.sin(a)}L${256+290*Math.cos(a+.16)} ${395+290*Math.sin(a+.16)}Z" fill="${i%2?p.secondary:p.accent}"/>`; }
    s+=`<g transform="rotate(-7 110 348)">${rect(28,296,156,91,p.paper)}${text('JÙJÚ',40,335,29,p.primary,'font-weight="bold"')}${line(40,349,162,349,p.primary,2)}${line(40,358,151,358,p.primary,2)}</g>`;
    s+=`<g transform="rotate(8 380 354)">${rect(310,298,175,104,p.secondary)}${text('AFROBEAT',319,331,22,p.paper,'font-weight="bold"')}${text('FÚJÌ / FUNK',319,367,21,p.accent)}</g>`;
    s+=circle(255,420,67,p.primary,`stroke="${p.paper}" stroke-width="5"`)+circle(255,420,28,p.accent)+circle(255,420,5,p.secondary);
    return `<g clip-path="url(#lower)">${s}</g>`;
  },
  cassette: (p) => {
    let s=rect(25,290,462,193,'#161e32','rx="31" stroke="#8c879e" stroke-width="5"');
    s+=rect(44,308,424,112,p.secondary,'rx="15"');
    for(let y=312;y<418;y+=5) s+=line(48,y,464,y,p.accent,1,'opacity=".35"');
    s+=`<path d="M63 370Q148 320 248 365T448 361" fill="none" stroke="${p.accent}" stroke-width="3"/>`;
    s+=rect(145,369,218,99,'#b6b4be','rx="8"')+rect(162,385,184,47,p.primary,'rx="7"');
    for(const x of [193,315]) s+=circle(x,408,19,p.paper)+circle(x,408,10,p.secondary)+circle(x,408,4,p.paper);
    s+=`<path d="M175 456l14 -19h134l14 19Z" fill="${p.secondary}"/>`+text('90',58,462,28,p.accent,'letter-spacing="2"');
    return s;
  },
  disc: (p) => {
    let s=rect(22,290,468,188,p.secondary,'rx="6"');
    s+=rect(30,298,452,23,p.accent)+text('MUSIC / TV',40,315,14,p.paper)+text('×',462,315,17,p.paper);
    s+=`<path d="M36 459l126 -116h94L130 459Z" fill="#51b788" opacity=".6"/>`;
    s+=circle(326,397,79,'url(#chrome)',`stroke="#fff" stroke-width="2"`);
    for(let r=19;r<78;r+=7) s+=circle(326,397,r,'none',`stroke="#f6faff" stroke-opacity=".4"`);
    s+=`<path d="M326 397l-55 -57 70 -21z" fill="#71cbd7" opacity=".65"/><path d="M326 397l52 59 -60 22z" fill="#a586d1" opacity=".7"/>`+circle(326,397,15,p.secondary)+circle(326,397,7,p.paper);
    s+=text('NG',55,383,46,p.paper,'font-weight="bold"')+line(56,403,184,403,p.accent,6)+line(56,424,142,424,'#51b788',6);
    return s;
  },
  city: (p) => {
    let s=rect(18,292,476,191,p.primary);
    s+=`<path d="M20 475L92 310H150L111 475ZM338 475L381 310H430L468 475Z" fill="${p.secondary}" opacity=".7"/>`;
    for(let i=0;i<15;i++) { const x=30+i*31; const y=350+(i*19)%77; s+=rect(x,y,21,480-y,i%3?p.secondary:'#642952'); if(i%3) s+=rect(x+5,y+8,3,4,p.accent); }
    s+=line(52,459,438,459,p.accent,3)+line(130,455,188,346,p.accent,4)+line(188,346,301,346,p.accent,4)+line(301,346,363,455,p.accent,4);
    s+=`<path d="M172 432l29 -51h102l31 51Z" fill="${p.primary}"/>`+circle(257,402,12,p.paper)+rect(249,413,16,31,p.paper);
    return s;
  },
  arena: (p) => {
    let s='';
    for(let row=0;row<7;row++) for(let col=0;col<26;col++) { const x=32+col*18,y=308+row*22; s+=circle(x,y,1.7,row>3&&col<9?p.accent:p.paper,`opacity="${row<3?.5:.9}"`); }
    s+=`<path d="M42 456L122 350H390L470 456" fill="none" stroke="${p.paper}" stroke-width="4"/>`+line(122,350,122,457,p.secondary,6)+line(390,350,390,457,p.secondary,6);
    s+=rect(169,372,174,65,p.secondary)+rect(182,384,148,40,'#111217')+line(209,476,303,476,p.accent,3);
    return s;
  },
};
const shapes = {
  weave:'M16 8H496V482L480 496H32L16 482Z',
  shellac:'M20 16H472L492 36V492H20Z',
  brass:'M16 106Q16 8 115 8H397Q496 8 496 106V492H16Z',
  print:'M24 8L486 20 496 485 14 496Z',
  cassette:'M48 8H464L496 40V460L464 492H48L16 460V40Z',
  disc:'M16 8H496V492H16Z',
  city:'M16 8H336V22H496V492H16Z',
  arena:'M16 8H496V449L443 492H69L16 449Z',
};
const tiles=ERAS.map((era,i)=>{
  const p=ERA_VISUALS[era.id], darkText=['shellac','disc'].includes(p.motif), ink=darkText?p.secondary:p.paper;
  const rows=wrap(era.headline,22); const font=rows.length>3?27:31; const leading=font+4;
  const statement=rows.map((row,j)=>text(row,36,166+j*leading,font,ink,'font-weight="bold" letter-spacing="-.5"')).join('');
  const graphic=`<path d="${shapes[p.motif]}" fill="${p.primary}"/>${line(36,38,474,38,p.accent,2)}${text(era.number,36,70,19,ink)}${text(era.title,36,121,era.id==='recording'?43:49,ink,'font-weight="bold" letter-spacing="-1.5"')}${statement}${motifs[p.motif](p)}`;
  return `<g transform="translate(${i%4*512+8} ${Math.floor(i/4)*512+8}) scale(.96875)"><clipPath id="tile${i}"><path d="${shapes[p.motif]}"/></clipPath><g clip-path="url(#tile${i})">${graphic}</g></g>`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" viewBox="0 0 2048 1024"><defs><linearGradient id="chrome"><stop stop-color="#f9fafb"/><stop offset=".3" stop-color="#83919e"/><stop offset=".54" stop-color="#f4f5f7"/><stop offset=".76" stop-color="#91aab1"/><stop offset="1" stop-color="#d4d5e2"/></linearGradient><clipPath id="lower"><rect x="0" y="290" width="512" height="205"/></clipPath></defs>${tiles}</svg>`;
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'era-worlds.svg'),svg);
await sharp(Buffer.from(svg)).webp({quality:88,alphaQuality:100}).toFile(path.join(out,'era-worlds-v1.webp'));
const stat=await fs.stat(path.join(out,'era-worlds.webp'));
console.log(`Era atlas: ${ERA_ATLAS.width} × ${ERA_ATLAS.height}, ${(stat.size/1024).toFixed(1)} KB, ${(ERA_ATLAS.width*ERA_ATLAS.height*4*4/3/1024/1024).toFixed(2)} MiB incl. mipmaps. Original geometric illustrations; no archival photographs.`);


