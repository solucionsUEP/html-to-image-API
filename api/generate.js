import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

// ─── CORS ─────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// ─── COLORS ───────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  concert: '#2563EB',
  festival: '#DC2626',
  festa_popular: '#16A34A',
  default: '#6B7280',
};

const CATEGORY_LABELS = {
  concert: 'CONCERT',
  festival: 'FESTIVAL',
  festa_popular: 'FESTA POPULAR',
  default: 'ALTRES',
};

const TYPE_TO_CATEGORY = {
  MusicEvent: 'concert',
  Event: 'default',
};

// ─── DATES ────────────────────────────────────────────────────────────────────
const MONTH_FULL = [
  'GENER','FEBRER','MARÇ','ABRIL','MAIG','JUNY',
  'JULIOL','AGOST','SETEMBRE','OCTUBRE','NOVEMBRE','DESEMBRE',
];
const MONTH_ABBR = [
  'GEN','FEB','MAR','ABR','MAI','JUN',
  'JUL','AGO','SET','OCT','NOV','DES',
];

// ─── PALETA VISUAL ────────────────────────────────────────────────────────────
const C = {
  bg: '#F4F3ED',
  accent: '#311B5E', // Deep Purple
};

const W = 1080;
const H = 1080;

// ─── RESTRICCIONS DE LAYOUT ───────────────────────────────────────────────────
const MAX_ZONES = 6;          // 2 columnes × 3 files màxim
const MAX_NAME_LEN = 38;      // caràcters màxims per nom d'event

// Events per zona decreixents segons quantes zones hi ha
function maxEventsForZoneCount(n) {
  if (n <= 2) return 6;
  if (n <= 4) return 5;
  return 4;
}

// ─── FONT & BG (memoïtzats) ───────────────────────────────────────────────────
let _fontData;
async function getFont() {
  if (!_fontData) {
    const res = await fetch('https://html-to-image-api-self.vercel.app/fonts/Inter-Bold.ttf');
    _fontData = await res.arrayBuffer();
  }
  return _fontData;
}

let _bgImageBase64;
async function getBgImage() {
  if (_bgImageBase64 === undefined) {
    try {
      await fetch('https://html-to-image-api-self.vercel.app/images/bg_optimized.png');
      _bgImageBase64 = 'https://html-to-image-api-self.vercel.app/images/bg_optimized.png';
    } catch (e) {
      console.warn("No s'ha trobat la textura de fons:", e.message);
      _bgImageBase64 = null;
    }
  }
  return _bgImageBase64;
}

// ─── HELPERS SCHEMA.ORG ───────────────────────────────────────────────────────
function isArchived(item) {
  return Array.isArray(item.additionalProperty) &&
    item.additionalProperty.some((p) => p.name === 'archived' && p.value === true);
}


function extractTime(startDate) {
  if (!startDate) return '--:--';
  const m = String(startDate).match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '--:--';
}

function parseDateRange(elements) {
  const dates = elements
    .map((li) => (li.item ?? li).startDate)
    .filter(Boolean)
    .map((s) => new Date(s))
    .filter((d) => !isNaN(d));

  if (dates.length === 0) return { dayNum: '??', monthStr: 'SENSE DATA', dayNum2: null, monthStr2: null };

  dates.sort((a, b) => a - b);
  const first = dates[0];
  const last = dates[dates.length - 1];

  const d1 = first.getDate();
  const m1 = first.getMonth();
  const d2 = last.getDate();
  const m2 = last.getMonth();

  if (d1 === d2 && m1 === m2) {
    return { dayNum: String(d1), monthStr: MONTH_FULL[m1], dayNum2: null, monthStr2: null };
  }
  if (m1 === m2) {
    return { dayNum: `${d1}-${d2}`, monthStr: MONTH_FULL[m1], dayNum2: null, monthStr2: null };
  }
  return { dayNum: String(d1), monthStr: MONTH_ABBR[m1], dayNum2: String(d2), monthStr2: MONTH_ABBR[m2] };
}

function truncateName(name) {
  if (name.length <= MAX_NAME_LEN) return name;
  return name.slice(0, MAX_NAME_LEN - 1) + '…';
}

function parseItemList(body) {
  const elements = body.itemListElement ?? [];

  const dateInfo = parseDateRange(elements);

  const zones = {};
  const usedCategories = new Set();

  for (const li of elements) {
    const item = li.item ?? li;
    if (!item || !item.name || !item.zone) continue;
    if (isArchived(item)) continue;

    const zone = item.zone.toUpperCase();
    if (!zones[zone]) zones[zone] = [];
    if (zones[zone].length >= 6) continue; // màxim generós durant la col·lecció

    const raw = item.category?.toLowerCase().replace(/\s+/g, '_') ?? TYPE_TO_CATEGORY[item['@type']] ?? 'default';
    const catKey = CATEGORY_COLORS[raw] ? raw : 'default';
    usedCategories.add(catKey);

    zones[zone].push({
      nom: truncateName(item.name),
      hora: extractTime(item.startDate),
      color: CATEGORY_COLORS[catKey],
    });
  }

  for (const zone of Object.keys(zones)) {
    zones[zone].sort((a, b) => a.hora.localeCompare(b.hora));
  }

  return { dateInfo, zones, usedCategories };
}

// Divideix les zones en grups de MAX_ZONES i aplica el límit d'events per grup
function chunkZones(zones) {
  const entries = Object.entries(zones);
  const chunks = [];
  for (let i = 0; i < entries.length; i += MAX_ZONES) {
    const slice = entries.slice(i, i + MAX_ZONES);
    const maxEv = maxEventsForZoneCount(slice.length);
    const chunk = {};
    for (const [name, events] of slice) {
      chunk[name] = events.length > maxEv ? events.slice(0, maxEv) : events;
    }
    chunks.push(chunk);
  }
  return chunks;
}

// ─── LAYOUT (objectes Satori sense JSX) ──────────────────────────────────────
function dot(color) {
  return {
    type: 'div',
    props: {
      style: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: color,
        flexShrink: 0,
        marginRight: 10,
      },
      children: ' ',
    },
  };
}

function eventRow(ev) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        width: '100%',
      },
      children: [
        dot(ev.color),
        {
          type: 'span',
          props: {
            style: {
              display: 'flex',
              flex: 1,
              fontSize: 16,
              color: C.accent,
              fontWeight: 700,
              lineHeight: 1.3,
              textTransform: 'uppercase',
            },
            children: ev.nom,
          },
        },
        {
          type: 'span',
          props: {
            style: {
              fontSize: 16,
              color: C.accent,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              marginLeft: 10,
              textAlign: 'right',
            },
            children: ev.hora + ' H',
          },
        },
      ],
    },
  };
}

function zoneCard(name, events) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '46%', // dues columnes amples
        marginBottom: 30,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-end',
              marginBottom: 10,
            },
            children: [
              {
                type: 'span',
                props: {
                  style: {
                    fontSize: 42,
                    fontWeight: 700,
                    color: '#FFF', // interior blanc per l'efecte outline
                    letterSpacing: 2,
                    textShadow: `
                      -2px -2px 0 ${C.accent},
                      2px -2px 0 ${C.accent},
                      -2px 2px 0 ${C.accent},
                      2px 2px 0 ${C.accent}
                    `,
                  },
                  children: name,
                },
              },
            ],
          },
        },
        ...events.map(eventRow),
      ],
    },
  };
}

function legend(usedCategories) {
  const order = ['concert', 'festival', 'festa_popular', 'default'];
  const cats = order.filter((k) => usedCategories.has(k));
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        border: `3px solid ${C.accent}`,
        borderRadius: 12,
        padding: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.65)',
        width: 320,
      },
      children: cats.map((k, i) => ({
        type: 'div',
        props: {
          style: { display: 'flex', alignItems: 'center', marginBottom: i < cats.length - 1 ? 6 : 0 },
          children: [
            dot(CATEGORY_COLORS[k]),
            { type: 'span', props: { style: { fontSize: 14, color: CATEGORY_COLORS[k], fontWeight: 700, marginLeft: 10 }, children: CATEGORY_LABELS[k] } },
          ],
        },
      })),
    },
  };
}

function dateBox(dayNum) {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.65)',
        border: `7px solid ${C.accent}`,
        borderRadius: 14,
        padding: '5px 20px',
        marginRight: 20,
      },
      children: {
        type: 'span',
        props: {
          style: { fontSize: 75, fontWeight: 700, color: C.accent, lineHeight: 1 },
          children: dayNum,
        },
      },
    },
  };
}

function buildLayout({ dayNum, monthStr, dayNum2, monthStr2 }, zones, bgImg, usedCategories) {
  const zoneNames = Object.keys(zones);

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: W,
        height: H,
        fontFamily: 'Inter Bold',
      },
      children: [
        ...(bgImg ? [{
          type: 'img',
          props: {
            src: bgImg,
            width: W,
            height: H,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              display: 'flex',
            }
          }
        }] : []),
        // Contingut Principal
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
            },
            children: [
              // ── HEADER ──────────────────────────────────────────────────────────
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    paddingTop: 50,
                    paddingBottom: 40,
                  },
                  children: [
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontSize: 90,
                          color: C.accent,
                          fontWeight: 700,
                          letterSpacing: -2,
                          marginRight: 20,
                        },
                        children: 'AGENDA',
                      },
                    },
                    dateBox(dayNum),
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontSize: 90,
                          color: C.accent,
                          fontWeight: 700,
                          letterSpacing: -2,
                          marginRight: dayNum2 ? 20 : 0,
                        },
                        children: monthStr,
                      },
                    },
                    ...(dayNum2 ? [
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: 90, color: C.accent, fontWeight: 700, marginRight: 20 },
                          children: '—',
                        },
                      },
                      dateBox(dayNum2),
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: 90, color: C.accent, fontWeight: 700, letterSpacing: -2 },
                          children: monthStr2,
                        },
                      },
                    ] : []),
                  ],
                },
              },

              // ── ZONES ────────────────────────────────────────────────────────────
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignContent: 'flex-start', // no estira les files verticalment
                    paddingLeft: 55,
                    paddingRight: 55,
                    flex: 1,
                    minHeight: 0,      // permet que flex shrink funcioni
                    overflow: 'hidden', // talla qualsevol desbordament
                  },
                  children: zoneNames.map((n) => zoneCard(n, zones[n])),
                },
              },

              // ── FOOTER ───────────────────────────────────────────────────────────
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    paddingLeft: 55,
                    paddingRight: 55,
                    paddingBottom: 50,
                  },
                  children: [
                    legend(usedCategories),
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: {
                                fontSize: 42,
                                color: C.accent,
                                fontWeight: 700,
                                letterSpacing: -1,
                                fontStyle: 'italic',
                              },
                              children: 'Segueix-nos!',
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: {
                                fontSize: 28,
                                color: C.accent,
                                fontWeight: 700,
                                marginTop: 8,
                              },
                              children: '@donambauxa.online',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ─── HANDLER EDGE ──────────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!body || body['@type'] !== 'ItemList') {
    return new Response(JSON.stringify({ error: 'El body ha de ser un schema.org ItemList.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { dateInfo, zones, usedCategories } = parseItemList(body);

  if (Object.keys(zones).length === 0) {
    return new Response(JSON.stringify({ error: 'No s\'han trobat events vàlids.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const fontData = await getFont();
    const bgImg = await getBgImage();
    const fontConfig = [{ name: 'Inter Bold', data: fontData, weight: 700, style: 'normal' }];

    const chunks = chunkZones(zones);
    const images = [];

    for (const chunk of chunks) {
      const element = buildLayout(dateInfo, chunk, bgImg, usedCategories);
      const imgResp = new ImageResponse(element, { width: W, height: H, fonts: fontConfig });
      const buffer = await imgResp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      images.push('data:image/png;base64,' + btoa(binary));
    }

    return new Response(JSON.stringify({ count: images.length, images }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[generate] error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: 'Error intern generant la imatge.' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}
