import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email/resend";

export const runtime = "nodejs";

// POST { customerId, subject, body } → sends (or simulates) a re-engagement email
// to a customer that belongs to the signed-in shop, and logs it to messages.
export async function POST(req: Request) {
  try {
    const { customerId, subject, body } = await req.json();
    if (!subject || !body) {
      return NextResponse.json({ error: "Missing subject or body" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in (connect Supabase) to send emails." },
        { status: 401 },
      );
    }

    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .single();
    if (!shop) return NextResponse.json({ error: "No shop found." }, { status: 400 });

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, email")
      .eq("id", customerId)
      .eq("shop_id", shop.id)
      .single();
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

    let status: "sent" | "simulated" = "simulated";
    if (emailConfigured() && customer.email) {
      await sendEmail({
        to: customer.email,
        subject,
        html: `<p>${String(body).replace(/\n/g, "<br>")}</p>`,
      });
      status = "sent";
    }

    await supabase.from("messages").insert({
      shop_id: shop.id,
      customer_id: customer.id,
      channel: "email",
      subject,
      body,
      status,
    });

    return NextResponse.json({ ok: true, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
