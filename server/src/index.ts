import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import ical from "ical-generator";
import { getVtimezoneComponent } from "@touch4it/ical-timezones";
import { DateTime } from "luxon";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
let secretId: string | undefined = process.env.RANDOM_IDENTIFER || process.env.AUTH_TOKEN || process.env.SECRET;
if (!secretId) {
  const generated = Bun.randomUUIDv7();
  secretId = generated;
  console.warn(`[WARN] No RANDOM_IDENTIFER / AUTH_TOKEN set - generated ${generated}`);
  console.warn(`       Set RANDOM_IDENTIFER in env for a stable secret URL (like elt2ical).`);
}
const DATA_FILE = process.env.DATA_FILE || "./data/timetable.json";
type Persisted = {
  id: string;
  events: ParsedInput[];
  dates?: string[];
  scrapedAt?: string;
  sourceUrl?: string;
  createdAt: string;
  ical: string;
};
type ParsedInput = {
  title: string;
  staff?: string;
  room?: string;
  date: string;
  start: string;
  end: string;
  raw?: string;
  color?: string;
};
type TimetablePayload = {
  dates?: string[];
  events: ParsedInput[];
  scrapedAt?: string;
  sourceUrl?: string;
};
const store = new Map<string, { ical: string; events: ParsedInput[]; createdAt: string }>();
async function persist(p: Persisted): Promise<void> {
  const dir = path.dirname(DATA_FILE);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await Bun.write(DATA_FILE, JSON.stringify(p, null, 2));
  console.log(`[persist] wrote ${p.events.length} events → ${DATA_FILE}`);
}
async function loadPersisted(): Promise<void> {
  if (!existsSync(DATA_FILE)) {
    console.log(`[persist] no existing ${DATA_FILE}`);
    return;
  }
  try {
    const raw = await Bun.file(DATA_FILE).text();
    const p = JSON.parse(raw) as Persisted;
    if (p?.ical && p?.events) {
      store.set(p.id, { ical: p.ical, events: p.events, createdAt: p.createdAt });
      if (p.id !== secretId) {
        store.set(secretId!, { ical: p.ical, events: p.events, createdAt: p.createdAt });
      } else {
        store.set(secretId!, { ical: p.ical, events: p.events, createdAt: p.createdAt });
      }
      console.log(`[persist] loaded ${p.events.length} events from ${DATA_FILE} (id=${p.id})`);
    } else {
      console.warn(`[persist] ${DATA_FILE} missing ical/events, skipping`);
    }
  } catch (e) {
    console.error(`[persist] failed to load ${DATA_FILE}:`, e);
  }
}
await loadPersisted();
function parseDateHeader(header: string, tz: string): DateTime | null {
  let dt = DateTime.fromFormat(header.trim(), "ccc dd/MM/yy", { zone: tz });
  if (dt.isValid) return dt;
  dt = DateTime.fromFormat(header.trim(), "ccc dd/MM/yyyy", { zone: tz });
  if (dt.isValid) return dt;
  const m = header.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (m) {
    const part = m[1];
    dt = part.split("/")[2].length === 2 ? DateTime.fromFormat(part, "dd/MM/yy", { zone: tz }) : DateTime.fromFormat(part, "dd/MM/yyyy", { zone: tz });
    if (dt.isValid) return dt;
  }
  dt = DateTime.fromISO(header, { zone: tz });
  if (dt.isValid) return dt;
  return null;
}
function buildCalendar(events: ParsedInput[], tz: string): string {
  const cal = ical({ name: "ProPortal Timetable" });
  cal.timezone({ name: tz, generator: getVtimezoneComponent });
  for (const ev of events) {
    let day = parseDateHeader(ev.date, tz);
    if (!day || !day.isValid) {
      day = DateTime.fromISO(ev.date, { zone: tz });
      if (!day || !day.isValid) continue;
    }
    const [sh, sm] = ev.start.split(":").map(Number);
    const [eh, em] = ev.end.split(":").map(Number);
    if (Number.isNaN(sh) || Number.isNaN(eh)) continue;
    const start = day.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const end = day.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    cal.createEvent({
      start: start.toJSDate(),
      end: end.toJSDate(),
      summary: ev.title || "Lesson",
      description: ev.staff ? `Staff: ${ev.staff}` : undefined,
      location: ev.room || undefined,
      timezone: tz,
    });
  }
  return cal.toString();
}
function extractAuthToken(request: Request): string | null {
  const h = request.headers;
  const auth = h.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  for (const key of ["x-auth-token", "x-prop2ical-token", "x-random-identifier", "authorization"]) {
    const v = h.get(key);
    if (v) {
      if (v.toLowerCase().startsWith("bearer ")) return v.slice(7).trim();
      return v.trim();
    }
  }
  try {
    const url = new URL(request.url);
    const qt = url.searchParams.get("token") || url.searchParams.get("auth");
    if (qt) return qt.trim();
  } catch {}
  return null;
}
function requireAuth(request: Request): Response | null {
  const token = extractAuthToken(request);
  if (token !== secretId) {
    return Response.json(
      { error: "Unauthorized", hint: "Send Authorization: Bearer <RANDOM_IDENTIFER> or X-Auth-Token header matching server secret" },
      { status: 401 },
    );
  }
  return null;
}
const app = new Elysia()
  .use(cors({ origin: true }))
  .use(
    openapi({
      path: "/openapi",
      documentation: {
        info: { title: "prop2ical", version: "1.0.0" },
      },
    }),
  )
  .get("/", () => ({ name: "prop2ical" }), { detail: { hide: true } })
  .post(
    "/api/timetable",
    async ({ body, request }) => {
      const authErr = requireAuth(request);
      if (authErr) return authErr;
      const payload = body as TimetablePayload;
      if (!payload?.events || !Array.isArray(payload.events) || payload.events.length === 0) {
        return Response.json({ error: "No events provided" }, { status: 400 });
      }
      const icalStr = buildCalendar(payload.events, process.env.TIMEZONE || "Europe/London");
      const createdAt = new Date().toISOString();
      const randomId = Bun.randomUUIDv7();
      store.set(secretId!, { ical: icalStr, events: payload.events, createdAt });
      store.set(randomId, { ical: icalStr, events: payload.events, createdAt });
      await persist({
        id: secretId!,
        events: payload.events,
        dates: payload.dates,
        scrapedAt: payload.scrapedAt,
        sourceUrl: payload.sourceUrl,
        createdAt,
        ical: icalStr,
      });
      const origin = new URL(request.url).origin;
      const icalUrl = `${origin}/api/ical/${secretId}`;
      const webcalUrl = icalUrl.replace(/^https?:/, "webcal:");
      return {
        id: secretId!,
        randomId,
        icalUrl,
        webcalUrl,
        eventCount: payload.events.length,
        dates: payload.dates,
        persistedTo: DATA_FILE,
      };
    },
    {
      body: t.Object({
        dates: t.Optional(t.Array(t.String())),
        events: t.Array(
          t.Object({
            title: t.String(),
            staff: t.Optional(t.String()),
            room: t.Optional(t.String()),
            date: t.String(),
            start: t.String(),
            end: t.String(),
            raw: t.Optional(t.String()),
            color: t.Optional(t.String()),
          }),
        ),
        scrapedAt: t.Optional(t.String()),
        sourceUrl: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/api/convert",
    async ({ body, request }) => {
      const authErr = requireAuth(request);
      if (authErr) return authErr;
      const payload = body as TimetablePayload;
      if (!payload?.events?.length) return Response.json({ error: "No events" }, { status: 400 });
      const icalStr = buildCalendar(payload.events, process.env.TIMEZONE || "Europe/London");
      return new Response(icalStr, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="timetable.ics"',
          "Access-Control-Allow-Origin": "*",
        },
      });
    },
    {
      body: t.Object({
        dates: t.Optional(t.Array(t.String())),
        events: t.Array(
          t.Object({
            title: t.String(),
            staff: t.Optional(t.String()),
            room: t.Optional(t.String()),
            date: t.String(),
            start: t.String(),
            end: t.String(),
            raw: t.Optional(t.String()),
            color: t.Optional(t.String()),
          }),
        ),
        scrapedAt: t.Optional(t.String()),
        sourceUrl: t.Optional(t.String()),
      }),
    },
  )
  .get("/api/ical/:id", ({ params }) => {
    if (params.id !== secretId) {
      const entry = store.get(params.id);
      if (!entry) return Response.json({ error: "Not found - id must equal RANDOM_IDENTIFER" }, { status: 404 });
      return new Response(entry.ical, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="${params.id}.ics"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    const entry = store.get(params.id);
    if (!entry) return Response.json({ error: "No timetable yet - POST /api/timetable first" }, { status: 404 });
    return new Response(entry.ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${params.id}.ics"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  })
  .get("/ical/:id", ({ params }) => {
    const id = params.id.replace(/\.ics$/, "");
    if (id !== secretId) {
      const entry = store.get(id);
      if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
      return new Response(entry.ical, {
        headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${id}.ics"` },
      });
    }
    const entry = store.get(id);
    if (!entry) return Response.json({ error: "No timetable yet" }, { status: 404 });
    return new Response(entry.ical, {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${id}.ics"` },
    });
  })
  .get("/api/debug/:id", ({ params, request }) => {
    if (params.id !== secretId && extractAuthToken(request) !== secretId) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const entry = store.get(params.id);
    if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
    return entry;
  })
  .get("/health", () => ({
    status: "ok",
    uptime: process.uptime(),
    hasData: store.size > 0,
    time: new Date().toISOString(),
  }))
  .listen(Number(process.env.PORT) || 3000);
console.log(`[prop2ical] Elysia listening on http://localhost:${Number(process.env.PORT) || 3000}`);
console.log(`[prop2ical] secretId (RANDOM_IDENTIFER) = ${secretId}`);
console.log(`[prop2ical] data file: ${DATA_FILE}`);
