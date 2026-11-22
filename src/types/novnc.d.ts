declare module '@novnc/novnc' {
  export interface NoVncOptions {
    shared?: boolean
    credentials?: { username?: string; password?: string; target?: string }
    repeaterID?: string
    wsProtocols?: string[]
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: NoVncOptions)
    scaleViewport: boolean
    resizeSession: boolean
    showDotCursor: boolean
    viewOnly: boolean
    focusOnClick: boolean
    clipViewport: boolean
    dragViewport: boolean
    disconnect(): void
    sendCredentials(credentials: { password: string; username?: string; target?: string }): void
    sendCtrlAltDel(): void
    sendKey(keysym: number, code: string, down?: boolean): void
    clipboardPasteFrom(text: string): void
  }
}

