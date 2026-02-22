// Step counting via DeviceMotion API (phone accelerometer)
// Works on Android Chrome. iOS needs permission prompt (handled).

const STEP_THRESHOLD    = 1.2   // min acceleration change to count a step
const STEP_COOLDOWN_MS  = 300   // min ms between steps (prevents double-count)

let stepCount    = 0
let lastMag      = 0
let lastStepTime = 0
let onStepUpdate = null
let active       = false

function getMagnitude(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z)
}

function handleMotion(e) {
  const acc = e.accelerationIncludingGravity
  if (!acc?.x) return

  const mag  = getMagnitude(acc.x, acc.y, acc.z)
  const diff = Math.abs(mag - lastMag)
  const now  = Date.now()

  if (diff > STEP_THRESHOLD && (now - lastStepTime) > STEP_COOLDOWN_MS) {
    stepCount++
    lastStepTime = now
    onStepUpdate?.(stepCount)
  }

  lastMag = mag
}

export async function startStepCounter(onUpdate) {
  // Reset
  stepCount    = 0
  lastMag      = 0
  lastStepTime = 0
  onStepUpdate = onUpdate
  active       = true

  // iOS 13+ requires explicit user permission
  if (typeof DeviceMotionEvent?.requestPermission === 'function') {
    const result = await DeviceMotionEvent.requestPermission()
    if (result !== 'granted') throw new Error('Motion permission denied')
  }

  window.addEventListener('devicemotion', handleMotion, { passive: true })
  onUpdate(0)  // immediately show 0
}

export function stopStepCounter() {
  window.removeEventListener('devicemotion', handleMotion)
  active       = false
  onStepUpdate = null
}

export function getStepCount() { return stepCount }

export function resetStepCount() {
  stepCount    = 0
  lastStepTime = 0
  lastMag      = 0
}

export function isSupported() {
  return typeof DeviceMotionEvent !== 'undefined'
}

export function isActive() { return active }
