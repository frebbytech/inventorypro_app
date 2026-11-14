declare module 'esc-pos-encoder' {
  export default class EscPosEncoder {
    initialize(): this;
    align(value: 'left' | 'center' | 'right'): this;
    line(text: string): this;
    size(width: 'normal' | 'double', height: 'normal' | 'double'): this;
    image(element: HTMLImageElement, width: number, height: number, algorithm?: string): this;
    cut(): this;
    encode(): Uint8Array;
  }
}
