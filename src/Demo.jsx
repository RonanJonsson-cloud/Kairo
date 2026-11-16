import { useEffect, useState } from 'react'
import BookingItem, { startOf } from './BookingItem.jsx'
import BusinessPage, { DEFAULT_SETTINGS, withIds } from './BusinessPage.jsx'
import CustomerPage from './CustomerPage.jsx'
import Layout from './Layout.jsx'
import SharePanel from './SharePanel.jsx'
import { TAKEN_MESSAGE, bookingError, detailsError, findClash } from './bookingRules.js'
import { connect, describeTimes } from './cloud.js'
import { toDateString } from './scheduling.js'
import { decodeBusiness, encodeBusiness } from './shareLink.js'

// A demo for judges and visitors, opened only from the link in the README
// (?demo). It is the whole app with no sign-in: the business page comes
// filled in, and its customer link (?demo=<settings>) opens the customer
// chat, AI included. Settings and bookings are kept in this browser only,
// never in the cloud, so visitors can't change anything for anyone else.

const DEMO_PARAM = 'demo'
const SETTINGS_KEY = 'kairo-demo-settings'
const BOOKINGS_KEY = 'kairo-demo-bookings'

const WORKDAY = { start: '09:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] }

export const DEMO_BUSINESS = {
  ...DEFAULT_SETTINGS,
  name: 'Kairo',
  handoffsTogether: true,
  turnaroundMinutes: 24 * 60,
  hours: [
    ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({
      day,
      ...WORKDAY,
    })),
    { day: 'Saturday', start: '10:00', end: '14:00', breaks: [] },
  ],
}

// Browser storage can be blocked (private windows, strict settings); the
// demo then still works, just without remembering anything.
let memory = {}
function load(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return memory[key] ?? null
  }
}
function store(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    memory = { ...memory, [key]: value }
  }
}

function loadBookings() {
  try {
    const bookings = JSON.parse(load(BOOKINGS_KEY) ?? '[]')
    return Array.isArray(bookings) ? bookings : []
  } catch {
    return []
  }
}

function saveBookings(bookings) {
  store(BOOKINGS_KEY, JSON.stringify(bookings))
}

function loadBusiness() {
  const saved = load(SETTINGS_KEY)
  return (saved && decodeBusiness(saved)) || DEMO_BUSINESS
}

function demoLink(business) {
  const base = window.location.origin + window.location.pathname
  return `${base}?${DEMO_PARAM}=${encodeBusiness(business)}`
}

function Banner({ children }) {
  return (
    <p className="card demo-banner" role="note">
      {children}
    </p>
  )
}

function DemoBookings({ bookings, onCancel, onRefresh }) {
  const sorted = [...bookings].sort((a, b) => startOf(a) - startOf(b))
  return (
    <section className="card">
      <h2>Bookings</h2>
      <p className="hint">Check here after bookings have been made.</p>
      {sorted.length === 0 ? (
        <p className="hint">No bookings yet. Open the customer link above and book a time.</p>
      ) : (
        <ul className="hours-list" aria-label="Bookings">
          {sorted.map((booking) => (
            <BookingItem key={booking.id} booking={booking} onCancel={onCancel} />
          ))}
        </ul>
      )}
      <button type="button" className="button link small" onClick={onRefresh}>
        Refresh
      </button>
    </section>
  )
}

// The business owner's page, already signed in.
function DemoBusiness() {
  const [initial] = useState(loadBusiness)
  const [settings, setSettings] = useState(() => {
    const { hours: _hours, ...rest } = initial
    return rest
  })
  const [hours, setHours] = useState(() => withIds(initial.hours))
  const [bookings, setBookings] = useState(loadBookings)

  const business = { ...settings, hours }
  const config = encodeBusiness(business)

  useEffect(() => {
    store(SETTINGS_KEY, config)
  }, [config])

  // Bookings made in another tab show up here straight away.
  useEffect(() => {
    function refresh(event) {
      if (event.key === BOOKINGS_KEY) setBookings(loadBookings())
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  function cancel(booking) {
    if (!window.confirm(`Cancel ${booking.name}'s booking? This frees up the time.`)) return
    const remaining = loadBookings().filter((other) => other.id !== booking.id)
    saveBookings(remaining)
    setBookings(remaining)
  }

  function reset() {
    if (!window.confirm('Start the demo over? This clears your changes and bookings.')) return
    store(SETTINGS_KEY, null)
    store(BOOKINGS_KEY, null)
    const { hours: demoHours, ...demoSettings } = DEMO_BUSINESS
    setSettings(demoSettings)
    setHours(withIds(demoHours))
    setBookings([])
  }

  const share = (
    <>
      <SharePanel
        business={business}
        link={demoLink(business)}
        intro="Try booking as a customer: scan the QR code with your phone, or copy the link below and paste it into your browser."
        preview={false}
      />
      <DemoBookings
        bookings={bookings}
        onCancel={cancel}
        onRefresh={() => setBookings(loadBookings())}
      />
    </>
  )

  return (
    <Layout
      title="Kairo"
      tagline="Demo"
      banner={
        <Banner>
          This is a demo of the business side, with no sign-in. Change anything you like: your
          changes and bookings are kept only in this browser.{' '}
          <button type="button" className="button link small" onClick={reset}>
            Reset demo
          </button>
        </Banner>
      }
    >
      <BusinessPage
        settings={settings}
        onSettingsChange={setSettings}
        hours={hours}
        onChange={setHours}
        share={share}
      />
    </Layout>
  )
}

// The customer chat, opened from the demo business's link or QR code.
function DemoCustomer({ business, outputs }) {
  const [taken, setTaken] = useState(() => loadBookings().flatMap((booking) => booking.slots))

  async function book(request) {
    const problem =
      detailsError(request) ||
      bookingError(business, request.service, request.slots, {
        earliestDate: toDateString(new Date()),
      })
    if (problem) return { ok: false, message: problem }
    const bookings = loadBookings()
    const allTaken = bookings.flatMap((booking) => booking.slots)
    setTaken(allTaken)
    if (findClash(request.slots, allTaken)) return { ok: false, message: TAKEN_MESSAGE }
    const booking = { id: `demo-${Date.now()}`, ...request }
    saveBookings([...bookings, booking])
    setTaken([...allTaken, ...request.slots])
    return { ok: true, message: '' }
  }

  // The AI assistant is the real one (with the same daily limits).
  const describe = outputs ? (text, dates) => describeTimes(connect(outputs), text, dates) : null

  return (
    <Layout
      title={business.name || 'Book a time'}
      tagline="Book a time · Kairo demo"
      banner={
        <Banner>
          This is a demo of the customer side. The AI assistant is real; bookings are kept only in
          this browser.
        </Banner>
      }
    >
      <CustomerPage business={business} taken={taken} onBook={book} onDescribe={describe} />
    </Layout>
  )
}

// `code` is the demo parameter's value: empty for the business page, or the
// business's settings for its customer page.
function Demo({ code, outputs }) {
  if (!code) return <DemoBusiness />
  const business = decodeBusiness(code)
  if (!business) {
    return (
      <Layout title="Kairo">
        <p className="card" role="alert">
          This demo link isn't valid. Please open the demo again from the README.
        </p>
      </Layout>
    )
  }
  return <DemoCustomer business={business} outputs={outputs} />
}

export default Demo
