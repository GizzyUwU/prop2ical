export type TimetableEvent = {
  title: string;
  staff: string;
  room: string;
  date: string;
  start: string;
  end: string;
  raw: string;
  color: string | null;
  dateHeader: string;
};
export type ScrapedData = {
  dates: string[];
  dateHeaders: string[];
  events: TimetableEvent[];
  scrapedAt: string;
  sourceUrl: string;
};
export type ServerResponse = {
  id: string;
  icalUrl: string;
  webcalUrl: string;
  eventCount: number;
  dates: string[];
};
export type MsgScrapeNow = { type: "PROP2ICAL_SCRAPE_NOW" };
export type MsgGetData = { type: "PROP2ICAL_GET_DATA" };
export type MsgResult = { type: "PROP2ICAL_RESULT"; payload: ServerResponse };
export type MsgScraped = { type: "PROP2ICAL_SCRAPED"; count: number };
export type MsgError = { type: "PROP2ICAL_ERROR"; error: string };
export type ExtensionMessage = MsgScrapeNow | MsgGetData | MsgResult | MsgScraped | MsgError;
