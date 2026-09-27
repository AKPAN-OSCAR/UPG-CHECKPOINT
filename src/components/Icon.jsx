import React from 'react';

// Ported path-for-path from the approved prototype's ICONS object —
// same stroke width/cap/join everywhere, one consistent icon language
// instead of mixing sources.
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9.5 20v-6h5v6"/>',
  trophy: '<path d="M8 3h8v4a4 4 0 0 1-8 0V3z"/><path d="M6 4H3v2a4 4 0 0 0 4 4"/><path d="M18 4h3v2a4 4 0 0 1-4 4"/><path d="M12 12v3"/><path d="M9 20h6"/><path d="M10 16h4v4h-4z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2 12.9 12.9 9.2 14.8 11.1 11.1z"/>',
  menu: '<path d="M4 6.5h16"/><path d="M4 12h16"/><path d="M4 17.5h16"/>',
  bell: '<path d="M6.5 8a5.5 5.5 0 0 1 11 0c0 4.5 1.8 5.7 1.8 5.7H4.7S6.5 12.5 6.5 8z"/><path d="M10.2 19.5a1.9 1.9 0 0 0 3.6 0"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
  flame: '<path d="M12.2 2.3c.3 2-.9 3-1.9 4.3-1.3 1.6-1.8 3-1.8 4.6a4.7 4.7 0 0 0 9.4 0c0-2.3-1.1-3.3-1.6-4.5-.3.9 0 1.8-.6 2.5-.1-2.2-1.4-4.2-3.5-6.9z"/>',
  clipboard: '<rect x="6" y="4" width="12" height="16" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6"/><path d="M9 15h6"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  trending: '<path d="M3 17 9.5 10.5 13.5 14.5 21 7"/><path d="M15 7h6v6"/>',
  slash: '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/>',
  kebab: '<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4.5 1L3.5 15.5z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12.5h4"/>',
  trash: '<path d="M4 7h16"/><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0"/><path d="M12 19v2.5"/>',
  vibrate: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M2.5 8.5v2"/><path d="M2.5 13.5v2"/><path d="M21.5 8.5v2"/><path d="M21.5 13.5v2"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5.5a9 9 0 0 1 0 13"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  shield: '<path d="M12 3 20 6.5v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9v-6z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9a2.7 2.7 0 1 1 3.7 2.5c-1 .5-1.5 1.1-1.5 2.3"/><path d="M12 17.2h.01"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.2 14 6.5 21l5.5-3 5.5 3-1.7-7"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>',
  arrowup: '<path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/>',
  chevright: '<path d="M9 6l6 6-6 6"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  barchart: '<path d="M4.5 20V10"/><path d="M10.5 20V4"/><path d="M16.5 20v-7"/><path d="M2.5 20h19"/>',
  bellring: '<path d="M6.5 8a5.5 5.5 0 0 1 11 0c0 4.5 1.8 5.7 1.8 5.7H4.7S6.5 12.5 6.5 8z"/><path d="M10.2 19.5a1.9 1.9 0 0 0 3.6 0"/><path d="M3 6c0-1.2.5-2.3 1.3-3.1"/><path d="M21 6c0-1.2-.5-2.3-1.3-3.1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  download: '<path d="M12 3v12.5"/><path d="M7 11l5 5 5-5"/><path d="M4.5 20h15"/>',
  upload: '<path d="M12 20.5V8"/><path d="M7 12.5l5-5 5 5"/><path d="M4.5 20h15"/>',
  logout: '<path d="M9.5 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16.5 17l4.5-5-4.5-5"/><path d="M21 12H9.5"/>',
};

export default function Icon({ name, size = 17, color, style, className }) {
  const svg = ICONS[name];
  if (!svg) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export { ICONS };
