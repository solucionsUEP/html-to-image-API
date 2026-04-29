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
  concert: '#2563EB', // blau
  festival: '#DC2626', // vermell
  festa_popular: '#16A34A', // verd
  default: '#6B7280', // gris
};

const TYPE_TO_CATEGORY = {
  MusicEvent: 'concert',
  Event: 'default',
};

// ─── PALETA VISUAL ────────────────────────────────────────────────────────────
const C = {
  bg: '#F4F3ED',
  accent: '#311B5E', // Deep Purple
};

const W = 1080;
const H = 1080;
const MAX_EVENTS_PER_ZONE = 8; // Ampliat per cabre més esdeveniments

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
      const res = await fetch('https://html-to-image-api-self.vercel.app/images/bg_optimized.png');
      const buffer = await res.arrayBuffer();
      // Converetim a base64 (necessari perquè Edge usa btoa per base64 manual, o simplement usem la URL directa)
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

function resolveCategory(item) {
  const raw = item.category?.toLowerCase().replace(/\s+/g, '_')
    ?? TYPE_TO_CATEGORY[item['@type']]
    ?? 'default';
  return CATEGORY_COLORS[raw] ?? CATEGORY_COLORS.default;
}

function extractTime(startDate) {
  if (!startDate) return '--:--';
  const m = String(startDate).match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '--:--';
}

function parseItemList(body) {
  const elements = body.itemListElement ?? [];

  let dateString = body.name ?? null;
  if (!dateString) {
    const first = elements.find((li) => (li.item ?? li).startDate);
    if (first) {
      const d = new Date((first.item ?? first).startDate);
      dateString = d.toLocaleDateString('ca-ES', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
    } else {
      dateString = 'SENSE DATA';
    }
  }

  let dayNum = "??";
  let monthStr = dateString.toUpperCase();
  const match = dateString.match(/(\d+)\s*(?:d'|de\s+)?([a-zA-ZçÇ]+)/i);
  if (match) {
    dayNum = match[1];
    monthStr = match[2].toUpperCase();
  }

  const zones = {};
  for (const li of elements) {
    const item = li.item ?? li;
    if (!item || !item.name || !item.zone) continue;
    if (isArchived(item)) continue;

    const zone = item.zone.toUpperCase();
    if (!zones[zone]) zones[zone] = [];
    if (zones[zone].length >= MAX_EVENTS_PER_ZONE) continue;

    zones[zone].push({
      nom: item.name,
      hora: extractTime(item.startDate),
      color: resolveCategory(item),
    });
  }
  // Ordenar cada zona per hora
  for (const zone of Object.keys(zones)) {
    zones[zone].sort((a, b) => a.hora.localeCompare(b.hora));
  }

  return { dayNum, monthStr, zones };
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

function legend() {
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
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', marginBottom: 6 },
            children: [
              dot(CATEGORY_COLORS.concert),
              { type: 'span', props: { style: { fontSize: 14, color: CATEGORY_COLORS.concert, fontWeight: 700, marginLeft: 10 }, children: 'CONCERT' } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', marginBottom: 6 },
            children: [
              dot(CATEGORY_COLORS.festival),
              { type: 'span', props: { style: { fontSize: 14, color: CATEGORY_COLORS.festival, fontWeight: 700, marginLeft: 10 }, children: 'FESTIVAL' } },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center' },
            children: [
              dot(CATEGORY_COLORS.festa_popular),
              { type: 'span', props: { style: { fontSize: 14, color: CATEGORY_COLORS.festa_popular, fontWeight: 700, marginLeft: 10 }, children: 'FESTA POPULAR' } },
            ],
          },
        },
      ],
    },
  };
}

function buildLayout(dayNum, monthStr, zones, bgImg) {
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
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(255, 255, 255, 0.65)', // Transparència
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
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontSize: 90,
                          color: C.accent,
                          fontWeight: 700,
                          letterSpacing: -2,
                        },
                        children: monthStr,
                      },
                    },
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
                    paddingLeft: 55,
                    paddingRight: 55,
                    flex: 1, // ocupa l'espai central
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
                    legend(),
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

  const { dayNum, monthStr, zones } = parseItemList(body);

  if (Object.keys(zones).length === 0) {
    return new Response(JSON.stringify({ error: 'No s\'han trobat events vàlids.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const fontData = await getFont();
    const bgImg = await getBgImage();
    const element = buildLayout(dayNum, monthStr, zones, bgImg);
    
    return new ImageResponse(element, {
      width: W,
      height: H,
      fonts: [
        {
          name: 'Inter Bold',
          data: fontData,
          weight: 700,
          style: 'normal',
        },
      ],
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[generate] error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: 'Error intern generant la imatge.' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}
