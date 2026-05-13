import { Application, Graphics, Container, BlurFilter } from 'pixi.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS: number[]       = [0xa78bfa, 0x818cf8, 0x38bdf8, 0xfb7185, 0xfbbf24, 0x34d399]
const MAX_HEALTH             = 100
const HIT_DAMAGE             = 18
const HEAL_RATE              = 3
const HIT_COOLDOWN           = 600
const LEVEL_INTERVAL         = 10
const BASE_PARTICLES         = 60
const PARTICLES_PER_LVL      = 30
const BASE_SPEED             = 1.2
const SPEED_PER_LVL          = 0.25
const PLAYER_RADIUS          = 10

// ─── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  dot:    Graphics
  glow:   Graphics
  x:      number
  y:      number
  vx:     number
  vy:     number
  life:   number
  radius: number
}

interface Player {
  x: number
  y: number
}

// ─── State ────────────────────────────────────────────────────────────────────

let particles:    Particle[] = []
let health        = MAX_HEALTH
let score         = 0
let bestScore     = 0
let elapsed       = 0
let level         = 1
let lastHitTime   = 0
let gameRunning   = false
let lastTimestamp = 0

const player: Player = { x: window.innerWidth / 2, y: window.innerHeight / 2 }

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const overlay    = document.getElementById('overlay')        as HTMLDivElement
const startBtn   = document.getElementById('start-btn')      as HTMLButtonElement
const finalScore = document.getElementById('final-score')    as HTMLDivElement
const finalBest  = document.getElementById('final-best')     as HTMLDivElement
const hudTime    = document.getElementById('hud-time')       as HTMLSpanElement
const hudLevel   = document.getElementById('hud-level')      as HTMLSpanElement
const hudCount   = document.getElementById('hud-count')      as HTMLSpanElement
const hudScore   = document.getElementById('hud-score')      as HTMLSpanElement
const hudBest    = document.getElementById('hud-best')       as HTMLSpanElement
const healthbar  = document.getElementById('healthbar')      as HTMLDivElement

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const app = new Application()

  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,        // ← transparent canvas so bg image shows through
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  document.body.appendChild(app.canvas)

  // ─── Layers ───────────────────────────────────────────────────────────────

  // Dark overlay on top of the bg image to darken/tint it
  const darkOverlay = new Graphics()
  const glowContainer  = new Container()
  const mainContainer  = new Container()
  const trailContainer = new Container()
  const playerGfx      = new Graphics()
  const playerGlow     = new Graphics()

  app.stage.addChild(darkOverlay)
  app.stage.addChild(trailContainer)
  app.stage.addChild(glowContainer)
  app.stage.addChild(mainContainer)
  app.stage.addChild(playerGlow)
  app.stage.addChild(playerGfx)

  const blurFilter = new BlurFilter({ strength: 8, quality: 3 })
  glowContainer.filters = [blurFilter]

  const playerBlur = new BlurFilter({ strength: 12, quality: 3 })
  playerGlow.filters = [playerBlur]

  // Draw a semi-transparent dark overlay so particles/UI stay readable
  function drawDarkOverlay(): void {
    darkOverlay.clear()
    darkOverlay.rect(0, 0, app.screen.width, app.screen.height)
    darkOverlay.fill({ color: 0x050510, alpha: 0.55 })
  }
  drawDarkOverlay()
  window.addEventListener('resize', drawDarkOverlay)

  // ─── Player ───────────────────────────────────────────────────────────────

  let hitFlash = 0

  function drawPlayer(hit: boolean): void {
    playerGfx.clear()
    playerGlow.clear()

    const color     = hit ? 0xff4466 : 0xffffff
    const glowColor = hit ? 0xff2244 : 0x818cf8

    playerGfx.circle(0, 0, PLAYER_RADIUS)
    playerGfx.fill({ color, alpha: 1 })

    playerGfx.circle(0, 0, PLAYER_RADIUS + 3)
    playerGfx.stroke({ color, alpha: 0.4, width: 1.5 })

    playerGfx.circle(0, 0, PLAYER_RADIUS + 7)
    playerGfx.stroke({ color: glowColor, alpha: 0.2, width: 1 })

    playerGlow.circle(0, 0, PLAYER_RADIUS * 3)
    playerGlow.fill({ color: glowColor, alpha: 0.5 })
  }

  drawPlayer(false)

  // ─── Trail ────────────────────────────────────────────────────────────────

  const TRAIL_LENGTH = 18
  const trail: { x: number; y: number }[] = []
  const trailDots: Graphics[] = []

  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const d = new Graphics()
    d.circle(0, 0, PLAYER_RADIUS * (1 - i / TRAIL_LENGTH) * 0.6)
    d.fill({ color: 0x818cf8, alpha: 1 })
    trailContainer.addChild(d)
    trailDots.push(d)
  }

  // ─── Particles ────────────────────────────────────────────────────────────

  function spawnParticles(count: number, speedMult: number): void {
    for (const p of particles) {
      mainContainer.removeChild(p.dot)
      glowContainer.removeChild(p.glow)
      p.dot.destroy()
      p.glow.destroy()
    }
    particles = []

    for (let i = 0; i < count; i++) {
      const color  = COLORS[Math.floor(Math.random() * COLORS.length)]
      const radius = Math.random() * 3 + 1.5

      const dot = new Graphics()
      dot.circle(0, 0, radius)
      dot.fill({ color, alpha: 0.95 })
      mainContainer.addChild(dot)

      const glow = new Graphics()
      glow.circle(0, 0, radius * 2.5)
      glow.fill({ color, alpha: 0.3 })
      glowContainer.addChild(glow)

      const angle = Math.random() * Math.PI * 2
      const dist  = Math.random() * 300 + 200
      const x     = player.x + Math.cos(angle) * dist
      const y     = player.y + Math.sin(angle) * dist

      const vAngle = Math.random() * Math.PI * 2
      const speed  = (Math.random() * 0.8 + 0.6) * speedMult

      particles.push({
        dot, glow,
        x, y,
        vx: Math.cos(vAngle) * speed,
        vy: Math.sin(vAngle) * speed,
        life: Math.random() * 100,
        radius,
      })
    }
  }

  // ─── Game start ───────────────────────────────────────────────────────────

  function startGame(): void {
    health        = MAX_HEALTH
    score         = 0
    elapsed       = 0
    level         = 1
    lastHitTime   = 0
    lastTimestamp = performance.now()
    gameRunning   = true
    hitFlash      = 0

    trail.length = 0
    player.x = app.screen.width  / 2
    player.y = app.screen.height / 2

    spawnParticles(BASE_PARTICLES, BASE_SPEED)
    overlay.classList.add('hidden')
    updateHUD()
  }

  // ─── Game over ────────────────────────────────────────────────────────────

  function gameOver(): void {
    gameRunning = false
    if (score > bestScore) bestScore = score

    finalScore.textContent = String(score)
    finalBest.textContent  = `Best: ${bestScore}`
    startBtn.textContent   = 'Play Again'
    finalScore.classList.remove('hidden')
    finalBest.classList.remove('hidden')

    const h1 = overlay.querySelector('h1') as HTMLElement
    const ps  = overlay.querySelectorAll('p')
    h1.textContent = 'You Died'
    h1.style.color = '#fb7185'
    ps[0].textContent = 'Survived'
    ps[1].textContent = `${elapsed.toFixed(1)} seconds · Level ${level}`

    overlay.classList.remove('hidden')
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!gameRunning) return
    player.x = e.clientX
    player.y = e.clientY
  })

  window.addEventListener('touchmove', (e: TouchEvent) => {
    if (!gameRunning) return
    player.x = e.touches[0].clientX
    player.y = e.touches[0].clientY
    e.preventDefault()
  }, { passive: false })

  startBtn.addEventListener('click', startGame)

  // ─── HUD ──────────────────────────────────────────────────────────────────

  function updateHUD(): void {
    hudTime.textContent  = `${elapsed.toFixed(1)}s`
    hudLevel.textContent = String(level)
    hudCount.textContent = String(particles.length)
    hudScore.textContent = String(score)
    hudBest.textContent  = String(bestScore)

    const pct = Math.max(0, health / MAX_HEALTH) * 100
    healthbar.style.width = `${pct}%`

    if (pct > 50) {
      healthbar.style.background = 'linear-gradient(90deg, #a78bfa, #38bdf8)'
    } else if (pct > 25) {
      healthbar.style.background = 'linear-gradient(90deg, #fbbf24, #fb923c)'
    } else {
      healthbar.style.background = 'linear-gradient(90deg, #fb7185, #e11d48)'
    }
  }

  // ─── Ticker ───────────────────────────────────────────────────────────────

  app.ticker.add(() => {
    if (!gameRunning) return

    const now   = performance.now()
    const delta = Math.min((now - lastTimestamp) / 1000, 0.05)
    lastTimestamp = now
    elapsed += delta

    // Level up
    const newLevel = Math.floor(elapsed / LEVEL_INTERVAL) + 1
    if (newLevel > level) {
      level = newLevel
      spawnParticles(
        BASE_PARTICLES + (level - 1) * PARTICLES_PER_LVL,
        BASE_SPEED     + (level - 1) * SPEED_PER_LVL,
      )
    }

    score = Math.floor(elapsed * 10 * level)

    const w = app.screen.width
    const h = app.screen.height
    let hitThisFrame = false

    for (const p of particles) {
      p.life += delta

      const dx   = player.x - p.x
      const dy   = player.y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const homingStrength = 0.0008 * Math.min(level, 6)

      p.vx += (dx / dist) * homingStrength
      p.vy += (dy / dist) * homingStrength

      p.vx += (Math.random() - 0.5) * 0.04
      p.vy += (Math.random() - 0.5) * 0.04

      p.vx *= 0.992
      p.vy *= 0.992

      const maxSpd = BASE_SPEED + (level - 1) * SPEED_PER_LVL + 1
      const spd    = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (spd > maxSpd) {
        p.vx = (p.vx / spd) * maxSpd
        p.vy = (p.vy / spd) * maxSpd
      }

      p.x += p.vx
      p.y += p.vy

      if (p.x < -10)    p.x = w + 10
      if (p.x > w + 10) p.x = -10
      if (p.y < -10)    p.y = h + 10
      if (p.y > h + 10) p.y = -10

      const colDist = Math.sqrt((p.x - player.x) ** 2 + (p.y - player.y) ** 2)
      if (colDist < PLAYER_RADIUS + p.radius) {
        hitThisFrame = true
        const nx = (p.x - player.x) / colDist
        const ny = (p.y - player.y) / colDist
        p.vx = nx * 3
        p.vy = ny * 3
      }

      const pulse = 0.55 + 0.45 * Math.sin(p.life * 2 + p.x * 0.01)
      p.dot.x  = p.x;  p.dot.y  = p.y;  p.dot.alpha  = pulse
      p.glow.x = p.x;  p.glow.y = p.y;  p.glow.alpha = pulse * 0.4
    }

    // Damage / heal
    if (hitThisFrame) {
      hitFlash = 1
      if (now - lastHitTime > HIT_COOLDOWN) {
        health -= HIT_DAMAGE
        lastHitTime = now
        if (health <= 0) { health = 0; updateHUD(); gameOver(); return }
      }
    } else {
      health = Math.min(MAX_HEALTH, health + HEAL_RATE * delta)
    }
    hitFlash = Math.max(0, hitFlash - delta * 4)

    // Trail
    trail.unshift({ x: player.x, y: player.y })
    if (trail.length > TRAIL_LENGTH) trail.pop()

    for (let i = 0; i < trailDots.length; i++) {
      const t = trail[i]
      if (!t) { trailDots[i].alpha = 0; continue }
      trailDots[i].x     = t.x
      trailDots[i].y     = t.y
      trailDots[i].alpha = (1 - i / TRAIL_LENGTH) * 0.35
    }

    // Player
    drawPlayer(hitFlash > 0.3)
    playerGfx.x  = player.x
    playerGfx.y  = player.y
    playerGlow.x = player.x
    playerGlow.y = player.y

    // Tint dark overlay red on hit
    darkOverlay.clear()
    darkOverlay.rect(0, 0, app.screen.width, app.screen.height)
    if (hitFlash > 0) {
      darkOverlay.fill({ color: 0x220005, alpha: 0.55 + hitFlash * 0.2 })
    } else {
      darkOverlay.fill({ color: 0x050510, alpha: 0.55 })
    }

    updateHUD()
  })
}

main()