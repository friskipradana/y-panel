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
    x: 150,
    y: 290,
    popupPos: 'above',
  },
  {
    // Peak 1 (top apex)
    x: 380,
    y: 110,
    popupPos: 'below',
  },
  {
    // Valley 2 (bottom apex)
    x: 610,
    y: 290,
    popupPos: 'above',
  },
  {
    // Peak 2 (top apex)
    x: 830,
    y: 110,
    popupPos: 'below',
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

  // ── Desktop 2D Proportional Serpentine Curve (Bleeds seamlessly through container edges) ──
  // Starts at (-40, 200) -> Valley 1 (150, 290) -> Peak 1 (380, 110) -> Valley 2 (610, 290) -> Peak 2 (830, 110) -> Exits at (1000, 200)
  const desktopRoad =
    'M -40,200 C 65,200 75,290 150,290 C 265,290 265,110 380,110 C 495,110 495,290 610,290 C 720,290 720,110 830,110 C 905,110 915,200 1000,200'

  // ── Mobile 2D Proportional Vertical Serpentine Curve (Bleeds seamlessly top and bottom) ──
  const mobileRoad =
    'M 160,-20 L 160,20 C 160,55 90,55 90,90 C 90,140 230,140 230,190 C 230,240 90,240 90,290 C 90,340 230,340 230,390 C 230,425 160,425 160,460 L 160,500'

  return (
    <div aria-label={label} className="mt-8 w-full select-none">
      {/* ═══════════════════════════════════════════════════════
          DESKTOP 2D PROPORTIONAL ROAD TIMELINE (Seamless Edge-to-Edge)
          ═══════════════════════════════════════════════════════ */}
      <div className="relative hidden w-full overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)]/25 sm:block sm:h-[400px] md:h-[420px]">
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
          viewBox="0 0 960 400"
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
          const topPct = (meta.y / 400) * 100

          const popupAlign =
            idx === 0
              ? 'left-1/2 -translate-x-[25%]'
              : idx === 3
              ? 'left-1/2 -translate-x-[75%]'
              : 'left-1/2 -translate-x-1/2'

          const arrowAlign =
            idx === 0
              ? 'left-[25%]'
              : idx === 3
              ? 'left-[75%]'
              : 'left-1/2 -translate-x-1/2'

          return (
            <div
              key={`desktop-pin-${idx + 1}`}
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              className="absolute z-20 -translate-x-1/2 -translate-y-[92%]"
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

              {/* ── Hover Popup Card (Anchored cleanly without overlapping neighboring pins) ── */}
              {isHovered && (
                <div
                  onMouseEnter={() => setHoveredStep(idx)}
                  onMouseLeave={() => setHoveredStep(null)}
                  className={`absolute z-40 w-72 md:w-80 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)]/95 backdrop-blur-md p-4 shadow-2xl pointer-events-auto transition-all ${popupAlign} ${
                    meta.popupPos === 'below'
                      ? 'top-[calc(100%+14px)]'
                      : 'bottom-[calc(100%+14px)]'
                  }`}
                >
                  {/* Arrow Pointer aligned to pin */}
                  <div
                    className={`absolute h-2.5 w-2.5 rotate-45 border-[var(--win-border)] bg-[var(--win-bg)] ${arrowAlign} ${
                      meta.popupPos === 'below'
                        ? '-top-1.5 border-t border-l'
                        : '-bottom-1.5 border-b border-r'
                    }`}
                  />

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
