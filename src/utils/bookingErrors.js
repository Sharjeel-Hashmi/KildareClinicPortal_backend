// Errors the booking code throws on purpose; routes turn them into clean JSON responses.
class BookingError extends Error {
  constructor(status, message, code = "BOOKING_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class SlotTakenError extends BookingError {
  constructor(message = "Sorry, that time slot has just been taken. Please choose another time.") {
    super(409, message, "SLOT_TAKEN");
  }
}

// Sends a BookingError as JSON; returns false for any other error so the caller can handle it.
const sendBookingError = (res, err) => {
  if (err instanceof BookingError) {
    res.status(err.status).json({ message: err.message, code: err.code });
    return true;
  }
  return false;
};

export { BookingError, SlotTakenError, sendBookingError };
