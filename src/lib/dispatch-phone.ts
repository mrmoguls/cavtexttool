// The dispatch phone, for "call or text dispatch" buttons. Admins can change it in settings
// (app_settings.dispatch_phone); otherwise Care-A-Van's dispatch line.
export const DEFAULT_DISPATCH_PHONE = '+15302214826'

export function dispatchPhone(settings: Record<string, unknown>) {
  const raw = typeof settings.dispatch_phone === 'string' && settings.dispatch_phone.trim() ? settings.dispatch_phone : DEFAULT_DISPATCH_PHONE
  const digits = raw.replace(/[^\d+]/g, '')
  const e164 = digits.startsWith('+') ? digits : `+1${digits.replace(/^1(?=\d{10}$)/, '')}`
  const n = e164.replace(/^\+1/, '')
  const display = n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}` : raw
  return { tel: `tel:${e164}`, sms: `sms:${e164}`, display }
}
