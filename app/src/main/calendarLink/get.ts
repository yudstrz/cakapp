/**
 * The one request a calendar link makes: the person's own calendar address, straight from this computer to their
 * calendar provider (Google, Outlook, …). No Cakapp server sits in between. Multi-year calendars can reach tens of MB (#146).
 */
const MAX_BYTES = 50 * 2 ** 20
const TIMEOUT_MS = 45_000

const tooBigError = () => Object.assign(new Error('calendar too big'), { code: 'too-big' })

export async function getCalendar(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow', headers: { accept: 'text/calendar, */*' } })
  if (!res.ok) throw new Error(`calendar address answered ${res.status}`)
  const size = Number(res.headers.get('content-length') ?? 0)
  if (size > MAX_BYTES) throw tooBigError()
  const text = await res.text()
  if (text.length > MAX_BYTES) throw tooBigError()
  return text
}
