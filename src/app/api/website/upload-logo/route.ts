import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * Upload a logo image to Supabase Storage (logos bucket).
 *
 * Expects a multipart/form-data request with:
 *   - file: the image file (png, jpeg, webp, svg)
 *   - orderId: the website_order id (used as filename prefix)
 *
 * Returns the public URL of the uploaded logo.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const orderId = formData.get('orderId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}` },
        { status: 400 },
      )
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
    }

    const admin = supabaseAdmin()

    // Generate a unique filename
    const ext = file.name.split('.').pop() || 'png'
    const prefix = orderId ? `${orderId}` : `logo-${Date.now()}`
    const filename = `${prefix}/logo.${ext}`

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadErr } = await admin
      .storage
      .from('logos')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadErr) throw uploadErr

    // Get public URL
    const { data: urlData } = admin
      .storage
      .from('logos')
      .getPublicUrl(uploadData.path)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: uploadData.path,
    })
  } catch (err) {
    console.error('[upload-logo] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
