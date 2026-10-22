import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadDemoEnv,
  repositoryRoot,
  verifyFinalVideo,
} from "./utils.mjs";

export async function verifyDemo(filename) {
  const resolved = path.resolve(repositoryRoot, filename);
  return verifyFinalVideo(resolved, {
    expectedWidth: 1440,
    expectedHeight: 900,
    expectedPixelFormat: "yuv420p",
    minimumDuration: 45,
    maximumDuration: 120,
  });
}

async function main() {
  loadDemoEnv();
  const filename = process.argv[2] || "dist/demo/MVP-Demo.mp4";
  const details = await verifyDemo(filename);
  console.log(
    `VERIFIED: ${path.relative(repositoryRoot, details.path)} | ${details.width}x${details.height} | ${details.videoCodec}/${details.audioCodec} | ${details.duration.toFixed(2)}s | ${details.sizeBytes} bytes`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`VERIFY FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
