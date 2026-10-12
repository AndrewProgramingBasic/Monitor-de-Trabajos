import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Proxy Route Handler for external redactar service.
 * Proxies multipart/form-data from the browser to localhost:7000
 * completely bypassing browser CORS restrictions.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    
    let targetUrl = (
      process.env.REDACTAR_URL ||
      process.env.NEXT_PUBLIC_REDACTAR_URL ||
      'http://localhost:7000/api/redactar'
    ).trim()

    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `http://${targetUrl}`
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
    })

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    }

    const text = await response.text()
    try {
      const parsed = JSON.parse(text)
      return NextResponse.json(parsed, { status: response.status })
    } catch {
      return new NextResponse(text, {
        status: response.status,
        headers: { 'content-type': contentType || 'text/plain' },
      })
    }
  } catch (error: any) {
    console.error('Error al conectar con servicio de redacción:', error)
    return NextResponse.json(
      {
        error: `No se pudo conectar con el servicio externo en el puerto 7000: ${error?.message || error}`,
      },
      { status: 502 }
    )
  }
}
