declare module 'hash-files' {
  export default function (
    options: {files: string[]; algorithm: string},
    callback: (err: Error | null, hash: string) => void
  ): void
}
