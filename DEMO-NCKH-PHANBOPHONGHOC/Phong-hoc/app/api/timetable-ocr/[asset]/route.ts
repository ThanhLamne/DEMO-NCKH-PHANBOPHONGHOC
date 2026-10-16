import { readFile } from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"

const OCR_ASSETS = new Map<string, { filePath: string; contentType: string }>([
  [
    "worker.min.js",
    {
      filePath: path.join(
        process.cwd(),
        "node_modules",
        "tesseract.js",
        "dist",
        "worker.min.js",
      ),
      contentType: "text/javascript; charset=utf-8",
    },
  ],
  ...[
    "tesseract-core.js",
    "tesseract-core-simd.js",
    "tesseract-core-lstm.js",
    "tesseract-core-simd-lstm.js",
    "tesseract-core.wasm.js",
    "tesseract-core-simd.wasm.js",
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js",
  ].map((asset) => [
    asset,
    {
      filePath: path.join(
        process.cwd(),
        "node_modules",
        "tesseract.js-core",
        asset,
      ),
      contentType: "text/javascript; charset=utf-8",
    },
  ] as const),
  ...[
    "tesseract-core.wasm",
    "tesseract-core-simd.wasm",
    "tesseract-core-lstm.wasm",
    "tesseract-core-simd-lstm.wasm",
  ].map((asset) => [
    asset,
    {
      filePath: path.join(
        process.cwd(),
        "node_modules",
        "tesseract.js-core",
        asset,
      ),
      contentType: "application/wasm",
    },
  ] as const),
  ...(["vie", "eng"] as const).map((language) => [
    `${language}.traineddata.gz`,
    {
      filePath: path.join(
        process.cwd(),
        "node_modules",
        "@tesseract.js-data",
        language,
        "4.0.0",
        `${language}.traineddata.gz`,
      ),
      contentType: "application/gzip",
    },
  ] as const),
])

export async function GET(
  _request: Request,
  context: { params: Promise<{ asset: string }> },
) {
  const { asset } = await context.params
  const selected = OCR_ASSETS.get(asset)
  if (!selected) return new Response("Not found", { status: 404 })

  try {
    const content = await readFile(selected.filePath)
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": selected.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("OCR asset is unavailable", { status: 500 })
  }
}
