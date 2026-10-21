import { useState } from 'react'
import type { LandingStep } from '@/pages/landing/LandingSteps'

interface IsometricJourneyProps {
  steps: LandingStep[]
  label: string
}

// 4 Milestone Pins placed precisely at the proportional curve apexes
const DESKTOP_PINS = [
  {
    // Valley 1 (bottom apex)
    x: 180,
    y: 350,
  },
  {
    // Peak 1 (top apex)
    x: 380,
    y: 210,
  },
  {
    // Valley 2 (bottom apex)
    x: 580,
    y: 350,
  },
  {
    // Peak 2 (gently elevated to y=235 with balanced top margin)
    x: 780,
    y: 235,
  },
] as const

const MOBILE_PINS = [
  {
    x: 90,
    y: 90,
  },
  {
    x: 230,
    y: 190,
  },
  {
    x: 90,
    y: 290,
  },
  {
    x: 230,
    y: 390,
  },
] as const

export function IsometricJourney({ steps, label }: IsometricJourneyProps) {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null)
  const [activeStep, setActiveStep] = useState<number>(0)

  const activeIdx = hoveredStep !== null ? hoveredStep : activeStep

  // ── Desktop 2D Proportional Serpentine Curve ──
  // First hill reaches y=210, while the end hill peaks at y=235 for an ideal top margin
  const desktopRoad =
    'M -40,280 C 70,280 70,350 180,350 C 280,350 280,210 380,210 C 480,210 480,350 580,350 C 680,350 680,235 780,235 C 890,235 890,290 1000,290'

  // ── Mobile 2D Proportional Vertical Serpentine Curve (Bleeds seamlessly top and bottom) ──
  const mobileRoad =
    'M 160,-20 L 160,20 C 160,55 90,55 90,90 C 90,140 230,140 230,190 C 230,240 90,240 90,290 C 90,340 230,340 230,390 C 230,425 160,425 160,460 L 160,500'

  return (
    <div aria-label={label} className="mt-8 w-full select-none">
      {/* ═══════════════════════════════════════════════════════
          DESKTOP 2D PROPORTIONAL ROAD TIMELINE (Seamless Edge-to-Edge)
          ═══════════════════════════════════════════════════════ */}
      <div className="relative hidden w-full overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)]/25 sm:block sm:h-[440px] md:h-[470px]">
        {/* Soft background grid texture */}
        <svg
          className="absolute inset-0 h-full w-full opacity-10 pointer-events-none rounded-2xl"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="road-grid-pattern" width="36" height="36" patternUnits="userSpaceOnUse">
              <circle cx="18" cy="18" r="1" fill="currentColor" className="text-[var(--win-border)]" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#road-grid-pattern)" />
        </svg>

        {/* 2D Road SVG Canvas (Bleeds edge to edge with preserveAspectRatio="none") */}
        <svg
          viewBox="0 0 960 440"
          preserveAspectRatio="none"
          className="relative z-10 h-full w-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 1. Road Drop Shadow */}
          <path
            d={desktopRoad}
            stroke="black"
            strokeWidth="30"
            strokeLinecap="butt"
            className="opacity-15 blur-sm translate-y-1.5"
          />

          {/* 2. Outer Curb Lines (Solid boundary stripes on road edges) */}
          <path
            d={desktopRoad}
            stroke="#94a3b8"
            strokeWidth="28"
            strokeLinecap="butt"
            className="opacity-80"
          />

          {/* 3. Dark Asphalt Road Pavement */}
          <path
            d={desktopRoad}
            stroke="#334155"
            strokeWidth="24"
            strokeLinecap="butt"
          />

          {/* 4. Center Dashed White Line */}
          <path
            d={desktopRoad}
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            strokeLinecap="butt"
            className="opacity-95"
          />
        </svg>

        {/* 4 Red Teardrop Location Pins (Positioned right on the curve apexes) */}
        {DESKTOP_PINS.map((meta, idx) => {
          const step = steps[idx]
          const isHovered = activeIdx === idx

          const leftPct = (meta.x / 960) * 100
          const topPct = (meta.y / 440) * 100

          return (
            <div
              key={`desktop-pin-${idx + 1}`}
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              className={`absolute -translate-x-1/2 -translate-y-[92%] transition-all ${
                isHovered ? 'z-50' : 'z-20'
              }`}
            >
              {/* Teardrop Pin Button */}
              <button
                type="button"
                onMouseEnter={() => setHoveredStep(idx)}
                onMouseLeave={() => setHoveredStep(null)}
                onClick={() => setActiveStep(idx)}
                aria-label={step.title}
                className={`group flex flex-col items-center cursor-pointer transition-all duration-200 ${
                  isHovered ? '-translate-y-2 scale-110' : 'hover:-translate-y-1'
                }`}
              >
                {/* 3D Red Teardrop Map Pin SVG */}
                <svg width="38" height="48" viewBox="0 0 38 48" fill="none" className="drop-shadow-lg">
                  {/* Pin Drop Shadow */}
                  <ellipse cx="19" cy="46" rx="6" ry="2" fill="rgba(0,0,0,0.4)" />

                  {/* Red Teardrop Pin Body */}
                  <path
                    d="M19 45 C19 45 2 27 2 18 C2 8.6 9.6 1 19 1 C28.4 1 36 8.6 36 18 C36 27 19 45 19 45 Z"
                    fill={isHovered ? '#dc2626' : '#ef4444'}
                    stroke={isHovered ? '#ffffff' : '#b91c1c'}
                    strokeWidth="1.5"
                    className="transition-colors"
                  />

                  {/* Inner White Circle */}
                  <circle cx="19" cy="18" r="11" fill="white" className="shadow-xs" />

                  {/* Step Number inside Pin */}
                  <text
                    x="19"
                    y="22.5"
                    textAnchor="middle"
                    fill="#1e293b"
                    fontSize="12"
                    fontWeight="800"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {idx + 1}
                  </text>
                </svg>
              </button>

              {/* ── Hover Popup Card (Always cleanly placed ABOVE the pin, perfectly centered) ── */}
              {isHovered && (
                <div
                  onMouseEnter={() => setHoveredStep(idx)}
                  onMouseLeave={() => setHoveredStep(null)}
                  className="absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 z-50 w-72 md:w-80 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)]/95 backdrop-blur-md p-4 shadow-2xl pointer-events-auto transition-all"
                >
                  {/* Arrow Pointer (Dead-center, perfectly aligned above the pin tip) */}
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rotate-45 border-b border-r border-[var(--win-border)] bg-[var(--win-bg)]" />

                  {/* Step Title */}
                  <h4
                    className={`text-[0.9375rem] font-bold leading-snug ${
                      step.accent ? 'text-[var(--panel-info-text)]' : 'text-[var(--win-text)]'
                    }`}
                  >
                    {step.title}
                  </h4>

                  {/* Step Description */}
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                    {step.desc}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════
          MOBILE 2D PORTRAIT ROAD TIMELINE
          ═══════════════════════════════════════════════════════ */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)]/25 sm:hidden h-[480px]">
        {/* Background dots */}
        <svg
          className="absolute inset-0 h-full w-full opacity-10 pointer-events-none rounded-2xl"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="road-grid-mobile" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="12" cy="12" r="1" fill="currentColor" className="text-[var(--win-border)]" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#road-grid-mobile)" />
        </svg>

        {/* 2D Portrait Road SVG */}
        <svg
          viewBox="0 0 320 480"
          preserveAspectRatio="none"
          className="relative z-10 h-full w-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 1. Road Drop Shadow */}
          <path
            d={mobileRoad}
            stroke="black"
            strokeWidth="30"
            strokeLinecap="butt"
            className="opacity-15 blur-sm translate-x-1"
          />

          {/* 2. Outer Curb Lines */}
          <path
            d={mobileRoad}
            stroke="#94a3b8"
            strokeWidth="28"
            strokeLinecap="butt"
            className="opacity-80"
          />

          {/* 3. Dark Asphalt Surface */}
          <path
            d={mobileRoad}
            stroke="#334155"
            strokeWidth="24"
            strokeLinecap="butt"
          />

          {/* 4. White Center Dashes */}
          <path
            d={mobileRoad}
            stroke="#ffffff"
            strokeWidth="2"
            strokeDasharray="5 5"
            strokeLinecap="butt"
            className="opacity-95"
          />
        </svg>

        {/* 4 Portrait Red Location Pins */}
        {MOBILE_PINS.map((meta, idx) => {
          const step = steps[idx]
          const isSelected = activeIdx === idx

          const leftPct = (meta.x / 320) * 100
          const topPct = (meta.y / 480) * 100

          return (
            <div
              key={`mob-pin-${idx + 1}`}
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              className="absolute z-20 -translate-x-1/2 -translate-y-[90%]"
            >
              <button
                type="button"
                onClick={() => setActiveStep(idx)}
                aria-label={step.title}
                className={`group flex flex-col items-center cursor-pointer transition ${
                  isSelected ? 'scale-115 -translate-y-1' : ''
                }`}
              >
                <svg width="32" height="42" viewBox="0 0 38 48" fill="none" className="drop-shadow-md">
                  <path
                    d="M19 45 C19 45 2 27 2 18 C2 8.6 9.6 1 19 1 C28.4 1 36 8.6 36 18 C36 27 19 45 19 45 Z"
                    fill={isSelected ? '#dc2626' : '#ef4444'}
                    stroke={isSelected ? '#ffffff' : '#b91c1c'}
                    strokeWidth="1.5"
                  />
                  <circle cx="19" cy="18" r="11" fill="white" />
                  <text
                    x="19"
                    y="22.5"
                    textAnchor="middle"
                    fill="#1e293b"
                    fontSize="12"
                    fontWeight="800"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    {idx + 1}
                  </text>
                </svg>
              </button>
            </div>
          )
        })}

        {/* Mobile: Clean Floating Detail Card (Shows when a pin is tapped) */}
        {activeIdx !== null && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 z-30 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)]/95 backdrop-blur-md p-3.5 shadow-xl transition-all">
            <h4
              className={`text-[0.875rem] font-bold leading-snug ${
                steps[activeIdx].accent ? 'text-[var(--panel-info-text)]' : 'text-[var(--win-text)]'
              }`}
            >
              {steps[activeIdx].title}
            </h4>

            <p className="mt-1 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
              {steps[activeIdx].desc}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
