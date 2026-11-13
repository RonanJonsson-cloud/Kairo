import { PAIRED_SERVICE, formatDate, formatRange, timelineMinutes } from './scheduling.js'

// One customer's booking in the business's Bookings list.

export function startOf(booking) {
  const first = booking.slots[0]
  return first ? timelineMinutes(first.date, first.start) : 0
}

function contactLink(contact) {
  return contact.includes('@') ? `mailto:${contact}` : `tel:${contact.replace(/[^\d+]/g, '')}`
}

function slotName(booking, index) {
  if (booking.service !== PAIRED_SERVICE) return booking.service
  return index === 0 ? 'Drop-off' : 'Pickup'
}

function BookingItem({ booking, onCancel }) {
  return (
    <li className="hours-item">
      {booking.slots.map((slot, index) => (
        <div key={index}>
          <strong>{slotName(booking, index)}</strong> {formatDate(slot.date)} {formatRange(slot)}
        </div>
      ))}
      <div>
        {booking.name} · <a href={contactLink(booking.contact)}>{booking.contact}</a>
      </div>
      {booking.comments && <p className="note">“{booking.comments}”</p>}
      <button type="button" className="button small" onClick={() => onCancel(booking)}>
        Cancel booking
      </button>
    </li>
  )
}

export default BookingItem
