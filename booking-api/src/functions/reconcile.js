import { createLogger, errorCode } from '../lib/log.js'

export function makeReconcileHandler(getRuntime) {
  return async (_timer, context) => {
    const log = createLogger(context)
    try {
      const rt = getRuntime()
      if (!rt.storageConfigured) {
        log.warn('reconcile_skipped', { reason: 'storage_not_configured' })
        return
      }
      await rt.reconciler(log).run()
    } catch (err) {
      log.error('reconcile_failed', { code: errorCode(err) })
    }
  }
}
