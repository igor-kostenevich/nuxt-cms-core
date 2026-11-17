/**
 * Where media files physically live (architecture Б7). The media repository
 * talks to this contract, never to a provider SDK, so Supabase Storage can be
 * replaced with S3, R2 or MinIO without touching the library or `CmsImage`.
 *
 * Paths are object names inside the CMS bucket, e.g. `3f2c….webp`.
 */
export interface CmsStorageAdapter {
  /** Writes a new object. Fails when the path exists: files are never overwritten (R-13). */
  upload(path: string, file: Blob, contentType: string): Promise<void>
  /** Removes objects. A missing object is not an error. */
  remove(paths: string[]): Promise<void>
  /** Public URL of an object. Synchronous and safe in the Public Runtime. */
  publicUrl(path: string): string
}
