declare module 'glob-all' {
  export default function (
    globs: string[],
    callback: (err: Error | null, files: string[]) => void
  ): void
}
