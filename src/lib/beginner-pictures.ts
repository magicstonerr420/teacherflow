// Built-in teaching pictures: no provider request, external image, font or printed answer label.
const face = (mouth: string) => `<circle cx="50" cy="50" r="34" fill="#ffdd8b"/><circle cx="38" cy="42" r="3"/><circle cx="62" cy="42" r="3"/><path d="${mouth}" fill="none" stroke-width="3"/>`;
const portrait = (shirt: string, hair: string, child = false) => `<path d="M${child ? 24 : 13} 95q0-32 ${child ? 26 : 37}-32t${child ? 26 : 37} 32" fill="${shirt}"/><circle cx="50" cy="40" r="${child ? 20 : 25}" fill="#ddb08d"/><path d="${hair}" fill="#654530"/><circle cx="42" cy="40" r="2"/><circle cx="58" cy="40" r="2"/><path d="M43 51q7 6 14 0" fill="none"/>`;
const person = (head: string, limbs: string) => `<circle ${head} r="8" fill="#ddb08d"/><path d="${limbs}" fill="none" stroke-width="7"/>`;
export const teachingColors: Record<string,string> = { red:'#e53935', blue:'#2575d6', green:'#2e9c54', yellow:'#f4cd32', orange:'#ee872a', purple:'#9255bb' };
export const teachingShapes: Record<string, (fill: string) => string> = {
  circle: fill => `<circle cx="50" cy="50" r="34" fill="${fill}"/>`,
  square: fill => `<rect x="17" y="17" width="66" height="66" fill="${fill}"/>`,
  triangle: fill => `<polygon points="50,12 88,83 12,83" fill="${fill}"/>`,
  rectangle: fill => `<rect x="10" y="27" width="80" height="46" fill="${fill}"/>`,
  oval: fill => `<ellipse cx="50" cy="50" rx="40" ry="25" fill="${fill}"/>`,
  star: fill => `<polygon points="50,9 61,36 91,38 68,57 76,87 50,70 24,87 32,57 9,38 39,36" fill="${fill}"/>`,
};
export const beginnerPictures: Record<string,string> = {
  ball:'<circle cx="50" cy="50" r="36" fill="#f4c66b"/><path d="M17 36q34 23 66 0M21 72q31-28 59 0M50 14q-18 36 0 72M50 14q21 36 0 72" fill="none" stroke="#b76c39"/>',
  car:'<path d="M11 50l13-4 13-23h29l15 23 9 5v24H11Z" fill="#83c4e0"/><path d="M40 28h21l10 18H30Z" fill="#eaf5fb"/><path d="M51 28v18" fill="none"/><circle cx="29" cy="74" r="11" fill="#364d5a"/><circle cx="74" cy="74" r="11" fill="#364d5a"/><circle cx="29" cy="74" r="4" fill="white"/><circle cx="74" cy="74" r="4" fill="white"/>',
  train:'<path d="M11 46h47v27H11Z" fill="#76bba4"/><path d="M56 23h31v50H56Z" fill="#76bba4"/><path d="M51 18h40v9H51Z" fill="#e4b65f"/><path d="M63 32h17v17H63Z" fill="#edf8ff"/><path d="M20 31h12v15H20Z" fill="#e4b65f"/><path d="M7 73h85v8H7Z" fill="#7d98aa"/><circle cx="26" cy="80" r="10" fill="#334c5c"/><circle cx="48" cy="80" r="10" fill="#334c5c"/><circle cx="76" cy="80" r="10" fill="#334c5c"/><path d="M15 94h74" fill="none"/>',
  teddy:'<circle cx="27" cy="22" r="12" fill="#d6a16b"/><circle cx="73" cy="22" r="12" fill="#d6a16b"/><ellipse cx="50" cy="66" rx="25" ry="28" fill="#d6a16b"/><ellipse cx="21" cy="59" rx="12" ry="19" fill="#d6a16b"/><ellipse cx="79" cy="59" rx="12" ry="19" fill="#d6a16b"/><ellipse cx="30" cy="86" rx="17" ry="12" fill="#d6a16b"/><ellipse cx="70" cy="86" rx="17" ry="12" fill="#d6a16b"/><circle cx="50" cy="33" r="25" fill="#d6a16b"/><ellipse cx="50" cy="44" rx="13" ry="10" fill="#f6deb6"/><circle cx="41" cy="30" r="2.5"/><circle cx="59" cy="30" r="2.5"/><path d="M46 40h8l-4 6Z" fill="#334c5c"/>',
  doll:'<path d="M30 28q0-24 20-24t20 24v15H30Z" fill="#70523c"/><circle cx="50" cy="28" r="16" fill="#f1cbac"/><path d="M40 43h20l14 35H26Z" fill="#c79fd3"/><path d="M37 46L18 64m45-18 19 18M39 78v13m22-13v13" stroke="#bd8c67" stroke-width="9" fill="none"/><path d="M33 92h12m11 0h12" stroke="#6a628c" stroke-width="7"/><circle cx="44" cy="27" r="2"/><circle cx="56" cy="27" r="2"/><path d="M45 34q5 4 10 0" fill="none"/>',
  mom: portrait('#c282ae','M25 43V30q0-27 25-27t25 27v20l-9-16-6-17q-11 15-34 15Z'),
  dad: portrait('#6caecf','M25 30q1-27 25-27t25 27l-15-10-12 6-7-8Z'),
  brother: portrait('#f0c260','M30 33q-1-23 20-23t20 23L57 23l-12 7-7-6Z',true),
  sister: portrait('#91c9ad','M30 33q-1-23 20-23t20 23l-12-10-16 8Z',true)+'<circle cx="22" cy="32" r="9" fill="#654530"/><circle cx="78" cy="32" r="9" fill="#654530"/>',
  baby:'<ellipse cx="50" cy="63" rx="28" ry="32" fill="#d6cff1"/><circle cx="50" cy="30" r="20" fill="#ddb08d"/><path d="M45 12q17-13 12 2M26 55l42 27M73 55L36 86" fill="none"/><circle cx="43" cy="29" r="2"/><circle cx="57" cy="29" r="2"/><circle cx="50" cy="39" r="5" fill="#a1d6df"/>',
  happy:face('M33 59q17 22 34 0'),
  sad:face('M34 71q16-21 32 0'),
  okay:face('M35 65h30'),
  apple:'<path d="M50 27C13 2 4 45 19 74q12 24 31 13 19 11 31-13C96 45 87 2 50 27Z" fill="#ec665a"/><path d="M50 27q-3-13 8-21" fill="none"/><path d="M55 18Q64 0 80 9Q70 25 55 18Z" fill="#75b87d"/><path d="M24 38q-9 14-3 25" stroke="white" fill="none"/>',
  banana:'<path d="M22 12q15 55 60 39l7-7q-2 42-46 40Q7 78 17 20Z" fill="#f8d968"/><path d="M22 19q-1 54 59 42M18 12l8 3-1 9-9-3m67 28 5-9 7 2-5 10" fill="none"/>',
  carrot:'<path d="M39 25Q19 23 18 45l51 45 4-66Z" fill="#ed993f"/><path d="M28 48l13-4M42 66l12-5M58 34l-11 7" fill="none"/><path d="M51 27Q42 3 55 5l3 15Q67-1 76 8L63 27Q90 6 91 20L69 36" fill="#78b97d"/>',
  milk:'<path d="M29 10h35l13 17v61H21V27Z" fill="#fffdf3"/><path d="M29 10l8 17H21m16 0v61m0-61h40M21 42h16v27H21m16-27h40v27H37" fill="#93c9df"/><path d="M29 10h35l13 17H37Z" fill="#c4e2ee"/>',
  bread:'<path d="M21 40C1 37 9 10 29 13Q50-1 71 13c20-3 28 24 8 27v47H21Z" fill="#d29c59"/><path d="M29 42C13 32 18 20 32 22q18-10 36 0c14-2 19 10 3 20v35H29Z" fill="#ffe5ae"/>',
  circle:'<circle cx="50" cy="50" r="34" fill="#edf1f5"/>',
  square:'<rect x="17" y="17" width="66" height="66" fill="#edf1f5"/>',
  run:person('cx="58" cy="16"','M54 30L40 53l23 12-8 23M40 53L20 79H8M52 33L71 46l16-7M49 36L29 30l-9 16')+'<path d="M5 35h13M3 48h11" fill="none"/>',
  jump:person('cx="50" cy="18"','M50 33v23M50 37L28 20l-8-11M50 37L72 20l8-11M50 56L33 73l-15-5M50 56l17 17 15-5')+'<path d="M31 93h38M9 57V35l-5 8m5-8 5 8M91 57V35l-5 8m5-8 5 8" fill="none"/>',
  sit:'<path d="M28 43v29h43M31 72v21m35-21v21" fill="none" stroke-width="4"/>'+person('cx="42" cy="20"','M42 36v29h25v25M44 43l17 12h18'),
  stand:person('cx="50" cy="16"','M50 32v28M50 38L31 57m19-19 19 19M50 60L38 91m12-31 12 31')+'<path d="M22 96h56" fill="none"/>',
  stop:person('cx="50" cy="18"','M50 34v27M50 40L31 52l-8-17M50 40l20 14M50 61L38 91m12-30 12 30')+'<path d="M16 33V19q0-3 3-3v10-16q3-4 5 0v14-15q4-3 5 2v14-10q4-3 5 1v16q-9 13-18 1Z" fill="#ddb08d"/>',
};
for (const [name, draw] of Object.entries(teachingShapes)) beginnerPictures[name] = draw('#edf1f5');
for(const [name,color] of Object.entries(teachingColors)) {
  beginnerPictures[name]=`<path d="M18 25q29-22 64 0v52q-30 15-64 0Z" fill="${color}"/>`;
  for (const [shape, draw] of Object.entries(teachingShapes)) beginnerPictures[`${name} ${shape}`] = draw(color);
}
beginnerPictures['family'] = ['mom','dad','brother','sister','baby'].map((word,i)=>
  `<g transform="translate(${i<2 ? 16+i*36 : 1+(i-2)*33},${i<2 ? 1 : 51}) scale(${i<2 ? 0.48 : 0.44})">${beginnerPictures[word]}</g>`).join('');
