import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

// The demo opened from the README: the whole app with no sign-in, keeping
// everything in this browser. The AI assistant is replaced by a pretend one.

const assistant = vi.hoisted(() => ({ calls: [] }))
vi.mock('./cloud.js', () => ({
  connect: () => 'db',
  describeTimes: async (db, text, dates) => {
    assistant.calls.push([db, text, dates])
    return { ok: true, message: '', ranges: [] }
  },
}))

const { default: Demo } = await import('./Demo.jsx')

function click(name) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function open(url) {
  cleanup()
  window.history.replaceState({}, '', url)
  render(<App />)
}

async function customerLink() {
  open('/?demo')
  const input = await screen.findByLabelText('Customer link')
  return new URL(input.value).search
}

async function bookFirstMorning(name) {
  click('Appointment')
  click('Monday, October 19')
  click('Next')
  click('Send')
  click('Mon Oct 19 9:00 AM – 9:30 AM')
  click('No')
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email or phone'), { target: { value: 'sam@example.com' } })
  click('Book')
  await screen.findByText(/You're booked/)
}

// Monday, October 19, 2026, 8:00 AM.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 19, 8, 0))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  assistant.calls = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('Demo', () => {
  it('opens a filled-in business page with no sign-in', async () => {
    open('/?demo')
    expect(await screen.findByRole('note')).toHaveTextContent('demo of the business side')
    expect(screen.getByLabelText('Business name')).toHaveValue('Kairo')
    expect(screen.getByRole('list', { name: 'Available hours' })).toHaveTextContent('Saturday')
    expect(screen.queryByText('Business sign-in')).not.toBeInTheDocument()
    expect(screen.getByText(/No bookings yet/)).toBeInTheDocument()
    expect(screen.getByText('Check here after bookings have been made.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.getByText(/scan the QR code with your phone, or copy the link/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Preview customer page' })).not.toBeInTheDocument()
  })

  it('is not linked from the front page', () => {
    open('/')
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument()
  })

  it('books through the customer link and lists the booking for the business', async () => {
    const link = await customerLink()
    expect(link).toMatch(/^\?demo=./)

    open(`/${link}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Kairo' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('demo of the customer side')
    await bookFirstMorning('Sam')

    // The booked time is taken for the next customer.
    open(`/${link}`)
    await screen.findByRole('heading', { level: 1, name: 'Kairo' })
    click('Appointment')
    click('Monday, October 19')
    click('Next')
    click('Send')
    expect(screen.queryByRole('button', { name: 'Mon Oct 19 9:00 AM – 9:30 AM' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mon Oct 19 9:30 AM – 10:00 AM' })).toBeInTheDocument()

    open('/?demo')
    const bookings = await screen.findByRole('list', { name: 'Bookings' })
    expect(bookings).toHaveTextContent('Sam')
    expect(bookings).toHaveTextContent('Mon Oct 19 9:00 AM – 9:30 AM')
    fireEvent.click(within(bookings).getByRole('button', { name: 'Cancel booking' }))
    expect(screen.getByText(/No bookings yet/)).toBeInTheDocument()
  })

  it("keeps the owner's changes in this browser until the demo is reset", async () => {
    open('/?demo')
    fireEvent.change(await screen.findByLabelText('Business name'), {
      target: { value: 'Fresh Sheets' },
    })
    const link = new URL(screen.getByLabelText('Customer link').value).search

    open('/?demo')
    expect(await screen.findByLabelText('Business name')).toHaveValue('Fresh Sheets')
    open(`/${link}`)
    expect(await screen.findByRole('heading', { name: 'Fresh Sheets' })).toBeInTheDocument()

    open('/?demo')
    fireEvent.click(await screen.findByRole('button', { name: 'Reset demo' }))
    expect(screen.getByLabelText('Business name')).toHaveValue('Kairo')
  })

  it('uses the real assistant when the cloud is connected', async () => {
    const link = await customerLink()
    cleanup()
    render(<Demo code={new URLSearchParams(link).get('demo')} outputs={{}} />)
    click('Appointment')
    fireEvent.change(screen.getByLabelText('What days are you usually free?'), {
      target: { value: 'weekday mornings' },
    })
    click('Next')
    await waitFor(() => expect(assistant.calls).toHaveLength(1))
    expect(assistant.calls[0].slice(0, 2)).toEqual(['db', 'weekday mornings'])
  })

  it('explains a broken demo link', async () => {
    open('/?demo=nonsense')
    expect(await screen.findByRole('alert')).toHaveTextContent("This demo link isn't valid")
  })
})
