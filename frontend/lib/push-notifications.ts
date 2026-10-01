// Web Push Notification Utilities for VPTI Task Monitor

// Helper with a strict timeout to prevent hanging UI on Service Worker promises
export function timeoutPromise<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SW timeout')), ms)
    promise
      .then((res) => {
        clearTimeout(timer)
        resolve(res)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function getDeviceLabel(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Web Client'
  }

  const ua = navigator.userAgent
  let browser = 'Browser'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Brave/')) browser = 'Brave'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari'

  let os = 'Unknown OS'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Linux')) os = 'Linux'

  return `${browser} on ${os}`
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // Force immediate activation
    if (reg.installing) {
      reg.installing.addEventListener('statechange', (e: any) => {
        if (e.target.state === 'activated') {
          console.log('[SW] Service worker activated.')
        }
      })
    }
    return reg
  } catch (err) {
    console.warn('[SW] Registration failed or unsupported:', err)
    return null
  }
}

export async function checkPushSubscription(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return false
  }
  try {
    // Wrap ready check with a 2.5s timeout so the UI never hangs
    const reg = (await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 2500)
      ),
    ])) as ServiceWorkerRegistration

    if (!reg || !reg.pushManager) return false
    const sub = await reg.pushManager.getSubscription()
    return sub !== null
  } catch (err) {
    console.warn('[Push] Check subscription skipped or timed out:', err)
    return false
  }
}

export async function subscribeToPush(customVapidKey?: string): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    throw new Error('Las notificaciones Push no son soportadas en este navegador.')
  }

  const rawApiUrl =
    process.env.NEXT_PUBLIC_API_URL || '/api'
  const apiUrl = rawApiUrl.replace(/\/$/, '')

  let vapidKey = customVapidKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    try {
      const vkRes = await timeoutPromise(
        fetch(`${apiUrl}/push/vapid-public-key`),
        2500
      )
      if (vkRes.ok) {
        const vkData = await vkRes.json()
        vapidKey = vkData?.public_key
      }
    } catch {
      // ignore
    }
  }

  if (!vapidKey) throw new Error('VAPID public key no configurada')

  // Register service worker and safely await ready with timeout
  await registerServiceWorker()
  const reg = (await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('El Service Worker tardó demasiado en responder.')), 3000)
    ),
  ])) as ServiceWorkerRegistration

  if (!reg || !reg.pushManager) {
    throw new Error('El Service Worker no está listo o PushManager no está disponible.')
  }

  const outputArray = urlBase64ToUint8Array(vapidKey)

  let sub: PushSubscription
  try {
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      sub = existing
    } else {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: outputArray,
      })
    }
  } catch (subErr: any) {
    const errMsg = subErr?.message || String(subErr)
    if (
      errMsg.toLowerCase().includes('push service error') ||
      errMsg.toLowerCase().includes('registration failed')
    ) {
      throw new Error(
        "Si usas navegadores como Brave, habilita 'Usar servicios de Google para mensajería push' en la configuración de privacidad (brave://settings/privacy) o prueba en Google Chrome / Edge."
      )
    }
    throw subErr
  }

  // Call backend to store subscription
  const token =
    (typeof window !== 'undefined' &&
      (localStorage.getItem('vpti_access_token') ||
        localStorage.getItem('token'))) ||
    ''

  const subJson = sub.toJSON()
  const deviceName = getDeviceLabel()

  const res = await timeoutPromise(
    fetch(`${apiUrl}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: subJson.keys,
        subscription: sub,
        device_name: deviceName,
        device_label: deviceName,
      }),
    }),
    4000
  )
  return res.ok
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const reg = (await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 2500)
      ),
    ])) as ServiceWorkerRegistration

    if (!reg || !reg.pushManager) return false
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await sub.unsubscribe()
      return true
    }
    return false
  } catch (err) {
    console.warn('[Push] Error unsubscribing:', err)
    return false
  }
}
