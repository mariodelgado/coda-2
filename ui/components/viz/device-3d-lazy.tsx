"use client"

import dynamic from "next/dynamic"
import type { Device3DProps } from "./device-3d"

const Inner = dynamic(() => import("./device-3d").then((m) => m.Device3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--stage)] text-[10px] text-[var(--tertiary-label)]">
      loading 3D device…
    </div>
  ),
})

export function Device3DLazy(props: Device3DProps) {
  return <Inner {...props} />
}
