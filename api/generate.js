const { ImageResponse } = require('@vercel/og');
const fs = require('fs');
const path = require('path');

// ─── CORS ─────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://www.donambauxa.online',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// ─── COLORS ───────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  concert:       '#F59E0B', // amber
  festival:      '#8B5CF6', // violet
  festa_popular: '#10B981', // emerald
  default:       '#6B7280', // gray
};

// Fallback quan `category` no existeix: deriva del @type de schema.org
const TYPE_TO_CATEGORY = {
  MusicEvent: 'concert',
  Event:      'default',
};

// ─── PALETA VISUAL ────────────────────────────────────────────────────────────
const C = {
  bg:          '#0F172A',
  cardBg:      '#1E293B',
  accent:      '#38BDF8',
  textPrimary: '#F1F5F9',
  textMuted:   '#94A3B8',
  textTime:    '#64748B',
  divider:     '#334155',
};

const W = 1080;
const H = 1080;
const MAX_EVENTS_PER_ZONE = 6;

// ─── FONT (memoïtzat) ─────────────────────────────────────────────────────────
let _fontData;
function getFont() {
  if (!_fontData) {
    _fontData = fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', 'Inter-Bold.ttf'));
  }
  return _fontData;
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

  // Data del header: camp "name" de l'ItemList, o deriva del primer event
  let dateString = body.name ?? null;
  if (!dateString) {
    const first = elements.find((li) => (li.item ?? li).startDate);
    if (first) {
      const d = new Date((first.item ?? first).startDate);
      dateString = d.toLocaleDateString('ca-ES', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
    } else {
      dateString = 'Sense data';
    }
  }

  const zones = {};
  for (const li of elements) {
    const item = li.item ?? li;
    if (!item || !item.name || !item.zone) continue;
    if (isArchived(item)) continue;

    const zone = item.zone;
    if (!zones[zone]) zones[zone] = [];
    if (zones[zone].length >= MAX_EVENTS_PER_ZONE) continue;

    zones[zone].push({
      nom:   item.name,
      hora:  extractTime(item.startDate),
      color: resolveCategory(item),
    });
  }

  return { dateString, zones };
}

// ─── LAYOUT (objectes Satori sense JSX) ──────────────────────────────────────
function dot(color) {
  return {
    type: 'div',
    props: {
      style: {
        width: 11,
        height: 11,
        borderRadius: 6,
        backgroundColor: color,
        flexShrink: 0,
        marginTop: 5,
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
        alignItems: 'flex-start',
        paddingTop: 7,
        paddingBottom: 7,
        borderBottom: `1px solid ${C.divider}`,
      },
      children: [
        dot(ev.color),
        {
          type: 'div',
          props: {
            style: { display: 'flex', flex: 1 },
            children: {
              type: 'span',
              props: {
                style: {
                  fontSize: 20,
                  color: C.textPrimary,
                  fontWeight: 700,
                  lineHeight: 1.35,
                },
                children: ev.nom,
              },
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              backgroundColor: C.divider,
              borderRadius: 6,
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 3,
              paddingBottom: 3,
              marginLeft: 12,
              flexShrink: 0,
            },
            children: {
              type: 'span',
              props: {
                style: { fontSize: 17, color: C.textTime, fontWeight: 700 },
                children: ev.hora,
              },
            },
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
        backgroundColor: C.cardBg,
        borderRadius: 14,
        padding: 18,
        marginBottom: 12,
        border: `1px solid ${C.divider}`,
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 8,
            },
            children: [
              {
                type: 'span',
                props: {
                  style: {
                    fontSize: 22,
                    fontWeight: 700,
                    color: C.accent,
                    letterSpacing: -0.5,
                  },
                  children: name,
                },
              },
              {
                type: 'span',
                props: {
                  style: {
                    fontSize: 13,
                    color: C.textMuted,
                    marginLeft: 10,
                    marginTop: 3,
                  },
                  children: `${events.length} event${events.length !== 1 ? 's' : ''}`,
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

function buildLayout(dateString, zones) {
  const zoneNames = Object.keys(zones);

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: W,
        height: H,
        backgroundColor: C.bg,
        padding: 38,
        fontFamily: 'Inter Bold',
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
              justifyContent: 'space-between',
              backgroundColor: C.cardBg,
              borderRadius: 18,
              paddingLeft: 30,
              paddingRight: 30,
              paddingTop: 20,
              paddingBottom: 20,
              marginBottom: 18,
              border: `1px solid ${C.divider}`,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column' },
                  children: [
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: 12, color: C.textMuted, letterSpacing: 2 },
                        children: 'DONAMBAUXA.ONLINE',
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontSize: 32,
                          fontWeight: 700,
                          color: C.textPrimary,
                          letterSpacing: -0.8,
                          marginTop: 2,
                        },
                        children: 'Agenda Cultural',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  },
                  children: [
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: 12, color: C.textMuted, letterSpacing: 1 },
                        children: 'DATA',
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontSize: 24,
                          fontWeight: 700,
                          color: C.accent,
                          marginTop: 2,
                        },
                        children: dateString,
                      },
                    },
                  ],
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
              flexDirection: 'column',
              flex: 1,
              overflow: 'hidden',
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
              justifyContent: 'center',
              marginTop: 12,
            },
            children: {
              type: 'span',
              props: {
                style: { fontSize: 13, color: C.textMuted },
                children: 'donambauxa.online · Esdeveniments musicals de Mallorca',
              },
            },
          },
        },
      ],
    },
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.status(204).end();
    return;
  }

  // CORS en totes les respostes
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  const body = req.body;

  if (!body || body['@type'] !== 'ItemList') {
    res.status(400).json({
      error: 'El body ha de ser un schema.org ItemList amb @type: "ItemList".',
    });
    return;
  }

  if (!Array.isArray(body.itemListElement) || body.itemListElement.length === 0) {
    res.status(400).json({ error: '"itemListElement" ha de ser un array no buit.' });
    return;
  }

  const { dateString, zones } = parseItemList(body);

  if (Object.keys(zones).length === 0) {
    res.status(400).json({
      error: 'No s\'han trobat events vàlids (possiblement tots estan arxivats o sense zona).',
    });
    return;
  }

  try {
    const element = buildLayout(dateString, zones);

    const imageResponse = new ImageResponse(element, {
      width: W,
      height: H,
      fonts: [
        {
          name: 'Inter Bold',
          data: getFont(),
          weight: 700,
          style: 'normal',
        },
      ],
    });

    const buffer = await imageResponse.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).end(Buffer.from(buffer));
  } catch (err) {
    console.error('[generate] error generant imatge:', err);
    res.status(500).json({
      error: 'Error intern generant la imatge.',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};
