declare module '@napi-rs/canvas' {
  export interface CanvasGradient {
    addColorStop(offset: number, color: string): void
  }

  export interface Image {}

  export interface CanvasRenderingContext2D {
    fillStyle: string | CanvasGradient
    font: string
    fillRect(x: number, y: number, width: number, height: number): void
    beginPath(): void
    moveTo(x: number, y: number): void
    lineTo(x: number, y: number): void
    closePath(): void
    fill(): void
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
    save(): void
    restore(): void
    drawImage(image: Image, dx: number, dy: number, dWidth: number, dHeight: number): void
    fillText(text: string, x: number, y: number): void
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
    clip(): void
  }

  export interface Canvas {
    getContext(contextId: '2d'): CanvasRenderingContext2D
    toBuffer(mimeType?: string): Buffer
  }

  export function createCanvas(width: number, height: number): Canvas
  export function loadImage(source: string | Buffer | ArrayBuffer | Uint8Array): Promise<Image>
}
