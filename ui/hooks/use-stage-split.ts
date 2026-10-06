"use client"

import React, { useCallback, useRef, useState } from "react"

// Enforce ~22–28% minimum per pane (MIN_FR/MAX_FR calibrated to a 3-pane sum ≈ 3.02).
const MIN_FR = 0.66
const MAX_FR = 2.22

const clampFr = (v: number) => Math.max(MIN_FR, Math.min(MAX_FR, v))

/**
 * iPadOS Split View–style three-pane fr state. Two 14px splitter tracks are fixed
 * and excluded from fr math. Default roughly equal thirds (~34/33/33).
 */
export function useStageSplit() {
  const [leftFr, setLeftFr] = useState(1.02)
  const [midFr, setMidFr] = useState(1.0)
  const [rightFr, setRightFr] = useState(1.0)
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    startX: number
    startLeft: number
    startMid: number
    startRight: number
    splitter: 0 | 1
  } | null>(null)

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const stageEl = stageRef.current
    const ds = dragStateRef.current
    if (!stageEl || !ds) return
    const rect = stageEl.getBoundingClientRect()
    const total = Math.max(1, rect.width)
    const dxPx = e.clientX - ds.startX
    // The two splitter tracks (14px each) are fixed; fr columns absorb the delta.
    const dxFr = (dxPx / total) * (ds.startLeft + ds.startMid + ds.startRight)

    if (ds.splitter === 0) {
      // Left | Mid splitter — adjust left vs mid, right unchanged
      let nextLeft = clampFr(ds.startLeft + dxFr)
      let nextMid = clampFr(ds.startMid - dxFr)
      const sumLM = nextLeft + nextMid
      const targetLM = ds.startLeft + ds.startMid
      const scaleLM = sumLM > 0 ? targetLM / sumLM : 1
      nextLeft = clampFr(nextLeft * scaleLM)
      nextMid = clampFr(nextMid * scaleLM)
      setLeftFr(nextLeft)
      setMidFr(nextMid)
    } else {
      // Mid | Right splitter — adjust mid vs right, left unchanged
      let nextMid = clampFr(ds.startMid + dxFr)
      let nextRight = clampFr(ds.startRight - dxFr)
      const sumMR = nextMid + nextRight
      const targetMR = ds.startMid + ds.startRight
      const scaleMR = sumMR > 0 ? targetMR / sumMR : 1
      nextMid = clampFr(nextMid * scaleMR)
      nextRight = clampFr(nextRight * scaleMR)
      setMidFr(nextMid)
      setRightFr(nextRight)
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    setIsDraggingSplit(false)
    dragStateRef.current = null
    window.removeEventListener("pointermove", handlePointerMove as unknown as EventListener)
  }, [handlePointerMove])

  const handleSplitterPointerDown = useCallback((e: React.PointerEvent) => {
    const stageEl = stageRef.current
    if (!stageEl) return
    const splitter = (e.currentTarget as HTMLElement).getAttribute("data-splitter") === "1" ? 1 : 0
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setIsDraggingSplit(true)
    dragStateRef.current = {
      startX: e.clientX,
      startLeft: leftFr,
      startMid: midFr,
      startRight: rightFr,
      splitter,
    }
    window.addEventListener("pointermove", handlePointerMove as unknown as EventListener, { passive: true })
    window.addEventListener("pointerup", handlePointerUp as unknown as EventListener, { once: true })
    window.addEventListener("pointercancel", handlePointerUp as unknown as EventListener, { once: true })
  }, [leftFr, midFr, rightFr, handlePointerMove, handlePointerUp])

  const onSplitterKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.12 : 0.04
    const el = e.currentTarget as HTMLElement
    const which = el.getAttribute("data-splitter") === "1" ? 1 : 0

    if (e.key === "ArrowLeft") {
      if (which === 0) {
        const nextL = clampFr(leftFr - step)
        const nextM = clampFr(midFr + step)
        const s = (nextL + nextM) / (leftFr + midFr)
        setLeftFr(clampFr(nextL / s))
        setMidFr(clampFr(nextM / s))
      } else {
        const nextM = clampFr(midFr - step)
        const nextR = clampFr(rightFr + step)
        const s = (nextM + nextR) / (midFr + rightFr)
        setMidFr(clampFr(nextM / s))
        setRightFr(clampFr(nextR / s))
      }
      e.preventDefault()
    } else if (e.key === "ArrowRight") {
      if (which === 0) {
        const nextL = clampFr(leftFr + step)
        const nextM = clampFr(midFr - step)
        const s = (nextL + nextM) / (leftFr + midFr)
        setLeftFr(clampFr(nextL / s))
        setMidFr(clampFr(nextM / s))
      } else {
        const nextM = clampFr(midFr + step)
        const nextR = clampFr(rightFr - step)
        const s = (nextM + nextR) / (midFr + rightFr)
        setMidFr(clampFr(nextM / s))
        setRightFr(clampFr(nextR / s))
      }
      e.preventDefault()
    }
  }, [leftFr, midFr, rightFr])

  return {
    leftFr,
    midFr,
    rightFr,
    isDraggingSplit,
    stageRef,
    handleSplitterPointerDown,
    onSplitterKeyDown,
  }
}
