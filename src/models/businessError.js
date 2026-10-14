// Kosa la "kawaida" la biashara (mfano: stock haitoshi, amana haitoshi) —
// controller linalirudisha kama 4xx na ujumbe wake, sio 500.
class BusinessError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message)
    this.name = 'BusinessError'
    this.status = status
    this.extra = extra
    this.isBusinessError = true
  }
}

module.exports = BusinessError
