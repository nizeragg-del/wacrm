import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params

  if (!mediaId) {
    return NextResponse.json(
      { error: 'Media ID is required' },
      { status: 400 }
    )
  }

  // Evolution API media download is temporarily disabled to prevent
  // excessive function executions. Returns a 1x1 transparent PNG.
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  return new Response(new Uint8Array(pixel), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
