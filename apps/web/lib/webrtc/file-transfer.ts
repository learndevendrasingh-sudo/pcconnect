import { CONFIG } from '@securedesk/shared';
import type { FileMetaMessage, FileChunkMessage, FileCompleteMessage } from '@securedesk/shared';

export class FileTransfer {
  private fileId: string;
  private file: File;
  private totalChunks: number;
  private onProgress: (progress: number) => void;

  constructor(file: File, onProgress: (progress: number) => void) {
    this.file = file;
    this.fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.totalChunks = Math.ceil(file.size / CONFIG.FILE_CHUNK_SIZE);
    this.onProgress = onProgress;
  }

  getMetaMessage(): FileMetaMessage {
    return {
      type: 'file_meta',
      fileId: this.fileId,
      fileName: this.file.name,
      fileSize: this.file.size,
      mimeType: this.file.type || 'application/octet-stream',
      totalChunks: this.totalChunks,
      timestamp: Date.now(),
    };
  }

  async *chunks(): AsyncGenerator<FileChunkMessage> {
    for (let i = 0; i < this.totalChunks; i++) {
      const start = i * CONFIG.FILE_CHUNK_SIZE;
      const end = Math.min(start + CONFIG.FILE_CHUNK_SIZE, this.file.size);
      const blob = this.file.slice(start, end);
      const buffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      this.onProgress(((i + 1) / this.totalChunks) * 100);

      yield {
        type: 'file_chunk',
        fileId: this.fileId,
        chunkIndex: i,
        data: base64,
        timestamp: Date.now(),
      };
    }
  }

  async getCompleteMessage(): Promise<FileCompleteMessage> {
    const buffer = await this.file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const checksum = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return {
      type: 'file_complete',
      fileId: this.fileId,
      checksum,
      timestamp: Date.now(),
    };
  }
}

// Receiver side — reassembles chunks into a file
export class FileReceiver {
  private files = new Map<string, {
    meta: FileMetaMessage;
    chunks: Map<number, string>;
    receivedCount: number;
  }>();

  handleMeta(meta: FileMetaMessage) {
    this.files.set(meta.fileId, {
      meta,
      chunks: new Map(),
      receivedCount: 0,
    });
  }

  handleChunk(chunk: FileChunkMessage): number {
    const file = this.files.get(chunk.fileId);
    if (!file) return 0;

    file.chunks.set(chunk.chunkIndex, chunk.data);
    file.receivedCount++;

    return (file.receivedCount / file.meta.totalChunks) * 100;
  }

  handleComplete(complete: FileCompleteMessage): { blob: Blob; fileName: string } | null {
    const file = this.files.get(complete.fileId);
    if (!file) return null;

    // Reassemble in order
    const sortedChunks = Array.from(file.chunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, data]) => data);

    const bytes = sortedChunks.map((base64) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    });

    const blob = new Blob(bytes, { type: file.meta.mimeType });
    const fileName = file.meta.fileName;

    this.files.delete(complete.fileId);

    return { blob, fileName };
  }
}
