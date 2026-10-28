// shared/notify.js — Windows desktop notifications
import notifier from 'node-notifier'
import path from 'path'

/**
 * Send a Windows toast notification
 * @param {string} title   - Notification title
 * @param {string} message - Notification body
 * @param {string} [sound] - Optional: 'Notification.Default' etc.
 */
export function notify(title, message, sound = true) {
  notifier.notify({
    title,
    message,
    sound,
    wait: false,
    appID: 'Agent OS'
  })
  console.log(`[Notify] ${title}: ${message}`)
}

/**
 * Send an urgent alert (blocking — waits for user to dismiss)
 */
export function alert(title, message) {
  notifier.notify({ title, message, sound: true, wait: true, appID: 'Agent OS' })
}
