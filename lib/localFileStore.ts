// lib/localFileStore.ts
// CLIENT-ONLY — never import in server code or API routes

let _handle: FileSystemDirectoryHandle | null = null;

export function setHandle(h: FileSystemDirectoryHandle): void {
  _handle = h;
}

export function getHandle(): FileSystemDirectoryHandle | null {
  return _handle;
}

export function clearHandle(): void {
  _handle = null;
}
