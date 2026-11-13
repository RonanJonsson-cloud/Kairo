import { Amplify } from 'aws-amplify'
import { generateClient } from 'aws-amplify/data'
import { cleanRanges, datesFrom } from './assistantRules.js'
import { toDateString } from './scheduling.js'

// The connection to the cloud backend, shared by the app and the demo.

// Customers don't sign in.
export const GUEST = { authMode: 'identityPool' }
const DESCRIBE_FAILED =
  "Sorry, I couldn't read that just now. Please pick your dates on the calendar instead."

let client = null
export function connect(outputs) {
  if (!client) {
    Amplify.configure(outputs)
    client = generateClient()
  }
  return client
}

export function readSlots(json) {
  try {
    const slots = typeof json === 'string' ? JSON.parse(json) : json
    return Array.isArray(slots) ? slots : []
  } catch {
    return []
  }
}

// The AI assistant reads the customer's description of when they're free.
export async function describeTimes(db, text, { firstDate, days }) {
  const { data, errors } = await db.queries.readAvailability(
    { text, today: toDateString(new Date()), firstDate, days },
    GUEST,
  )
  if (errors?.length || !data) return { ok: false, message: DESCRIBE_FAILED }
  if (!data.ok) return { ok: false, message: data.message }
  const allowed = datesFrom(firstDate, days).map(({ date }) => date)
  return { ok: true, message: '', ranges: cleanRanges(readSlots(data.ranges), allowed) }
}
