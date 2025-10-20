'use client'

import React from 'react'

type HeaderExtrasContextValue = {
  shareControl: React.ReactNode
  setShareControl: (node: React.ReactNode) => void
}

const HeaderExtrasContext = React.createContext<HeaderExtrasContextValue | undefined>(undefined)

export function HeaderExtrasProvider({ children }: { children: React.ReactNode }) {
  const [shareControl, setShareControlState] = React.useState<React.ReactNode>(null)

  const setShareControl = React.useCallback((node: React.ReactNode) => {
    setShareControlState(node)
  }, [])

  const value = React.useMemo(
    () => ({
      shareControl,
      setShareControl
    }),
    [shareControl, setShareControl]
  )

  return <HeaderExtrasContext.Provider value={value}>{children}</HeaderExtrasContext.Provider>
}

export function useHeaderExtras() {
  const context = React.useContext(HeaderExtrasContext)
  if (!context) {
    throw new Error('useHeaderExtras must be used within a HeaderExtrasProvider')
  }
  return context
}
