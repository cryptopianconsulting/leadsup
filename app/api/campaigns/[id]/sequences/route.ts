import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabase, supabaseServer } from "@/lib/supabase"

async function getUserIdFromSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("session")?.value

    if (!sessionToken) {
      return null
    }

    const { data: session, error } = await supabaseServer
      .from("user_sessions")
      .select("user_id, expires_at")
      .eq("session_token", sessionToken)
      .single()

    if (error || !session) {
      return null
    }
    
    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      return null
    }

    return session.user_id
  } catch {
    return null
  }
}

// GET - Fetch sequences for a campaign
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserIdFromSession()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const campaignId = (await params).id

    // Verify campaign belongs to user
    const { data: campaign, error: campaignError } = await supabaseServer
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 })
    }

    // Fetch sequences
    const { data: sequences, error: sequenceError } = await supabaseServer
      .from("campaign_sequences")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("step_number", { ascending: true })

    if (sequenceError) {
      console.error("❌ Error fetching sequences:", sequenceError)
      return NextResponse.json({ success: false, error: sequenceError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: sequences || [] })

  } catch (error) {
    console.error("❌ Error fetching sequences:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

// POST - Save/update sequences for a campaign
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserIdFromSession()

    if (!userId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const campaignId = (await params).id
    const body = await request.json()
    const { sequences } = body

    // Verify campaign belongs to user
    const { data: campaign, error: campaignError } = await supabaseServer
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("user_id", userId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 })
    }

    // Delete existing sequences
    const { error: deleteError } = await supabaseServer
      .from("campaign_sequences")
      .delete()
      .eq("campaign_id", campaignId)

    if (deleteError) {
      console.error("❌ Error deleting sequences:", deleteError)
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 })
    }

    // Insert new sequences
    if (sequences && sequences.length > 0) {
      const sequenceData = sequences.map((seq: any, index: number) => ({
        campaign_id: campaignId,
        step_number: index + 1,
        subject: seq.subject || null,
        content: seq.content || "",
        timing_days: seq.timing || 1,
        variants: seq.variants || 1,
        outreach_method: seq.outreach_method || "email"
      }))

      const { data: newSequences, error: insertError } = await supabaseServer
        .from("campaign_sequences")
        .insert(sequenceData)
        .select()

      if (insertError) {
        console.error("❌ Error inserting sequences:", insertError)
        return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, data: newSequences })
    }

    return NextResponse.json({ success: true, data: [] })

  } catch (error) {
    console.error("❌ Error saving sequences:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}