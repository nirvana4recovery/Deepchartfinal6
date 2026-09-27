import * as React from "react"

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false

  // Keep phones/tablets in the mobile layout in portrait. On a tablet-sized
  // touchscreen in landscape, use the full chart-terminal layout so the
  // TradingView-style top/left/right/bottom toolbars have room to render.
  const portrait = window.matchMedia("(orientation: portrait)").matches
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches
  const noHover = window.matchMedia("(hover: none)").matches
  const landscape = window.matchMedia("(orientation: landscape)").matches
  const tabletLandscape = landscape && window.matchMedia("(min-width: 900px)").matches

  return portrait || (coarsePointer && noHover && !tabletLandscape)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => getIsMobile())

  React.useEffect(() => {
    const orientationMql = window.matchMedia("(orientation: portrait)")
    const landscapeMql = window.matchMedia("(orientation: landscape)")
    const tabletWidthMql = window.matchMedia("(min-width: 900px)")
    const pointerMql = window.matchMedia("(pointer: coarse)")
    const hoverMql = window.matchMedia("(hover: none)")
    let timer: ReturnType<typeof setTimeout> | null = null

    const onChange = () => {
      // Debounce orientation/input-capability changes so rotation does not cause
      // rapid mount/unmount cycles while the browser is resizing the viewport.
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        setIsMobile(getIsMobile())
        timer = null
      }, 320)
    }

    orientationMql.addEventListener("change", onChange)
    landscapeMql.addEventListener("change", onChange)
    tabletWidthMql.addEventListener("change", onChange)
    pointerMql.addEventListener("change", onChange)
    hoverMql.addEventListener("change", onChange)

    return () => {
      orientationMql.removeEventListener("change", onChange)
      landscapeMql.removeEventListener("change", onChange)
      tabletWidthMql.removeEventListener("change", onChange)
      pointerMql.removeEventListener("change", onChange)
      hoverMql.removeEventListener("change", onChange)
      if (timer !== null) clearTimeout(timer)
    }
  }, [])

  return isMobile
}
