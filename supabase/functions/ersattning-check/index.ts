import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function set_shelf_life(request: NextRequest) {
  try {
    const { method } = request.method === 'OPTIONS' ? { method: 'OPTIONS' } : request.method

    if (method !== 'POST') {
      return new NextResponse(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { sap_article_id, shelf_lifetime_days, expiry_date, arrival_date, compensation_price_ore } = await request.json()

    // Validation
    if (!sap_article_id) throw new Error('sap_article_id is required')
    if (shelf_lifetime_days == null || expiry_date == null || arrival_date == null) {
      throw new Error('shelf_lifetime_days, expiry_date, and arrival_date are required')
    }

    // Validate dates
    const expiry = new Date(expiry_date)
    const arrival = new Date(arrival_date)
    if (expiry <= arrival) {
      throw new Error('expiry_date must be after arrival_date')
    }

    // Check if record exists
    const { data: existing, error: existingError } = await supabase
      .from('product_shelf_life')
      .select('id')
      .eq('sap_article_id', sap_article_id)
      .single()

    if (existing) {
      // Update existing record
      const { data: updated, error: updateError } = await supabase
        .from('product_shelf_life')
        .update({
          shelf_lifetime_days: shelf_lifetime_days,
          expiry_date: expiry,
          arrival_date: arrival,
          compensation_price_ore: compensation_price_ore || 2,
          updated_at: new Date().toISOString()
        })
        .eq('sap_article_id', sap_article_id)
        .eq('id', existing.id)

      if (updateError) throw updateError
    } else {
      // Insert new record
      const { data: newRecord, error: insertError } = await supabase
        .from('product_shelf_life')
        .insert({
          sap_article_id: sap_article_id,
          shelf_lifetime_days: shelf_lifetime_days,
          expiry_date: expiry,
          arrival_date: arrival,
          compensation_price_ore: compensation_price_ore || 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (insertError) throw insertError
    }

    return new NextResponse(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error in set_shelf_life:', error)
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export async function get_shelf_life(request: NextRequest) {
  // This would be used for calculating rules
  // Implementation would go here
  return new NextResponse(JSON.stringify({ error: 'Not implemented yet' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' }
  })
}

// Define the tool for MCP server
export const tool = {
  name: 'set_shelf_life',
  description: 'Set shelf life information for a product',
  parameters: {
    type: 'object',
    properties: {
      sap_article_id: { type: 'string', description: 'SAP/MAT-NR identifier' },
      shelf_lifetime_days: { type: 'integer', description: 'Total shelf life in days' },
      expiry_date: { type: 'string', format: 'date-time', description: 'Best before date (ISO 8601)' },
      arrival_date: { type: 'string', format: 'date-time', description: 'Arrival date at store (ISO 8601)' },
      compensation_price_ore: { type: 'integer', description: 'Compensation price in öre' }
    },
    required: ['sap_article_id', 'shelf_lifetime_days', 'expiry_date', 'arrival_date']
  }
}