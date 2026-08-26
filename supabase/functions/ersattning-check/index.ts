import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const { sap_article_id, shelf_lifetime_days, expiry_date, arrival_date, compensation_price_ore } = await req.json()

    if (!sap_article_id) throw new Error('sap_article_id is required')
    if (shelf_lifetime_days == null || expiry_date == null || arrival_date == null) {
      throw new Error('shelf_lifetime_days, expiry_date, and arrival_date are required')
    }

    const expiry = new Date(expiry_date)
    const arrival = new Date(arrival_date)
    if (expiry <= arrival) {
      throw new Error('expiry_date must be after arrival_date')
    }

    const { data: existing, error: existingError } = await supabase
      .from('product_shelf_life')
      .select('id')
      .eq('sap_article_id', sap_article_id)
      .maybeSingle()

    if (existingError) throw existingError

    const payload = {
      sap_article_id,
      shelf_lifetime_days,
      expiry_date: expiry.toISOString(),
      arrival_date: arrival.toISOString(),
      compensation_price_ore: compensation_price_ore ?? 2,
      updated_at: new Date().toISOString()
    }

    if (existing) {
      const { error } = await supabase.from('product_shelf_life').update(payload).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('product_shelf_life').insert({ ...payload, created_at: new Date().toISOString() })
      if (error) throw error
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})