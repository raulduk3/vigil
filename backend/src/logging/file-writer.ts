/**
 * Log File Writer
 *
 * Handles writing logs to files with rotation support.
 */

import { mkdir, stat, rename, readdir, unlink } from "node:fs/promises";
import { appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { LoggerConfig } from "./types";

/**
 * File writer state for a single log file
 */
interface FileState {
    path: string;
    currentSize: number;
    lastWrite: number;
}

/**
 * Log file writer with rotation
 */
export class LogFileWriter {
    private config: LoggerConfig;
    private fileStates: Map<string, FileState> = new Map();
    private ensuredDirs: Set<string> = new Set();
    private writeQueue: Map<string, string[]> = new Map();
    private flushTimer: Timer | null = null;
    private flushInterval = 100; // ms

    constructor(config: LoggerConfig) {
        this.config = config;
        this.startFlushTimer();
    }

    /**
     * Write a log entry to a file
     */
    async write(filePath: string, content: string): Promise<void> {
        const fullPath = join(this.config.logDir, filePath);

        // Queue the write
        const queue = this.writeQueue.get(fullPath) || [];
        queue.push(content);
        this.writeQueue.set(fullPath, queue);
    }

    /**
     * Immediately flush all pending writes
     */
    async flush(): Promise<void> {
        const promises: Promise<void>[] = [];

        for (const [fullPath, queue] of this.writeQueue.entries()) {
            if (queue.length > 0) {
                const content = queue.join("");
                this.writeQueue.set(fullPath, []);
                promises.push(this.writeToFile(fullPath, content));
            }
        }

        await Promise.all(promises);
    }

    /**
     * Write content to a specific file
     */
    private async writeToFile(
        fullPath: string,
        content: string
    ): Promise<void> {
        try {
            // Ensure directory exists
            const dir = dirname(fullPath);
            await this.ensureDir(dir);

            // Check if rotation needed
            await this.rotateIfNeeded(fullPath);

            // Append to file
            appendFileSync(fullPath, content);

            // Update state
            const state = this.fileStates.get(fullPath) || {
                path: fullPath,
                currentSize: 0,
                lastWrite: Date.now(),
            };
            state.currentSize += Buffer.byteLength(content);
            state.lastWrite = Date.now();
            this.fileStates.set(fullPath, state);
        } catch (error) {
            // Log to console if file writing fails
            console.error(
                `[LogFileWriter] Failed to write to ${fullPath}:`,
                error
            );
        }
    }

    /**
     * Ensure a directory exists
     */
    private async ensureDir(dir: string): Promise<void> {
        if (this.ensuredDirs.has(dir)) {
            return;
        }

        try {
            await mkdir(dir, { recursive: true });
            this.ensuredDirs.add(dir);
        } catch (error: any) {
            if (error.code !== "EEXIST") {
                throw error;
            }
            this.ensuredDirs.add(dir);
        }
    }

    /**
     * Rotate log file if it exceeds max size
     */
    private async rotateIfNeeded(filePath: string): Promise<void> {
        if (!existsSync(filePath)) {
            return;
        }

        try {
            const stats = await stat(filePath);
            if (stats.size < this.config.maxFileSize) {
                return;
            }

            // Rotate files
            await this.rotateFiles(filePath);
        } catch (error) {
            // Ignore stat errors
        }
    }

    /**
     * Rotate log files (file.log -> file.log.1 -> file.log.2 -> ...)
     */
    private async rotateFiles(filePath: string): Promise<void> {
        // Delete oldest file if it exists
        const oldestPath = `${filePath}.${this.config.maxFiles}`;
        if (existsSync(oldestPath)) {
            await unlink(oldestPath);
        }

        // Shift existing rotated files
        for (let i = this.config.maxFiles - 1; i >= 1; i--) {
            const oldPath = `${filePath}.${i}`;
            const newPath = `${filePath}.${i + 1}`;
            if (existsSync(oldPath)) {
                await rename(oldPath, newPath);
            }
        }

        // Rename current file to .1
        await rename(filePath, `${filePath}.1`);

        // Reset file state
        this.fileStates.delete(filePath);
    }

    /**
     * Start the flush timer for batched writes
     */
    private startFlushTimer(): void {
        this.flushTimer = setInterval(() => {
            this.flush().catch(console.error);
        }, this.flushInterval);
    }

    /**
     * Stop the writer and flush remaining logs
     */
    async close(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
    }

    /**
     * Get list of log files in a directory
     */
    async listLogFiles(subdir?: string): Promise<string[]> {
        const dir = subdir
            ? join(this.config.logDir, subdir)
            : this.config.logDir;
        try {
            const files = await readdir(dir);
            return files.filter(
                (f) => f.endsWith(".log") || f.includes(".log.")
            );
        } catch {
            return [];
        }
    }
}
