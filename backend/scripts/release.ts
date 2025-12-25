#!/usr/bin/env bun

/**
 * Simple release script for Vigil
 * 
 * Usage:
 *   bun run scripts/release.ts [patch|minor|major]
 * 
 * This script will:
 * 1. Verify working directory is clean
 * 2. Run all checks (typecheck, lint, format, test)
 * 3. Bump version in package.json
 * 4. Commit changes
 * 5. Create git tag
 * 6. Push to remote
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

type ReleaseType = "patch" | "minor" | "major";

const PACKAGE_JSON_PATH = resolve(import.meta.dir, "../package.json");

function incrementVersion(version: string, type: ReleaseType): string {
  const [major, minor, patch] = version.split(".").map(Number);
  
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`Invalid version format: ${version}`);
  }

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function exec(cmd: string): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(cmd.split(" "), {
    stdout: "pipe",
    stderr: "inherit",
  });

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  return {
    stdout: stdout.trim(),
    exitCode: proc.exitCode ?? 0,
  };
}

async function main() {
  const releaseType = process.argv[2] as ReleaseType | undefined;

  if (!releaseType || !["patch", "minor", "major"].includes(releaseType)) {
    console.error("Usage: bun run scripts/release.ts [patch|minor|major]");
    process.exit(1);
  }

  console.log(`🚀 Starting ${releaseType} release...\n`);

  // 1. Verify clean working directory
  console.log("1️⃣  Checking git status...");
  const { stdout: gitStatus } = await exec("git status --porcelain");
  if (gitStatus) {
    console.error("❌ Working directory is not clean. Commit or stash changes first.");
    process.exit(1);
  }
  console.log("✅ Working directory is clean\n");

  // 2. Run all checks
  console.log("2️⃣  Running type check...");
  const { exitCode: typeCheckCode } = await exec("bun run typecheck");
  if (typeCheckCode !== 0) {
    console.error("❌ Type check failed");
    process.exit(1);
  }
  console.log("✅ Type check passed\n");

  console.log("3️⃣  Running linter...");
  const { exitCode: lintCode } = await exec("bun run lint");
  if (lintCode !== 0) {
    console.error("❌ Linting failed");
    process.exit(1);
  }
  console.log("✅ Linting passed\n");

  console.log("4️⃣  Checking code format...");
  const { exitCode: formatCode } = await exec("bun run format:check");
  if (formatCode !== 0) {
    console.error("❌ Code formatting check failed. Run 'bun run format' to fix.");
    process.exit(1);
  }
  console.log("✅ Code formatting is correct\n");

  console.log("5️⃣  Running tests...");
  const { exitCode: testCode } = await exec("bun test");
  if (testCode !== 0) {
    console.error("❌ Tests failed");
    process.exit(1);
  }
  console.log("✅ All tests passed\n");

  // 3. Bump version
  console.log("6️⃣  Bumping version...");
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
  const oldVersion = packageJson.version;
  const newVersion = incrementVersion(oldVersion, releaseType);
  packageJson.version = newVersion;

  writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + "\n");
  console.log(`✅ Version bumped: ${oldVersion} → ${newVersion}\n`);

  // 4. Commit changes
  console.log("7️⃣  Creating release commit...");
  await exec("git add package.json");
  await exec(`git commit -m "chore: release v${newVersion}"`);
  console.log("✅ Release commit created\n");

  // 5. Create tag
  console.log("8️⃣  Creating git tag...");
  await exec(`git tag v${newVersion}`);
  console.log(`✅ Tag v${newVersion} created\n`);

  // 6. Push to remote
  console.log("9️⃣  Pushing to remote...");
  await exec("git push");
  await exec("git push --tags");
  console.log("✅ Pushed to remote\n");

  console.log(`🎉 Release v${newVersion} complete!`);
}

main().catch((error) => {
  console.error("❌ Release failed:", error);
  process.exit(1);
});
