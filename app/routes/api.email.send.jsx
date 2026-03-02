// app/routes/api.email.send.jsx
import db from "../db.server";

const corsHeaders = {
  // Allow the extension origin (dev - * is fine here)
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  // Allow ANY headers from Shopify's extension runtime
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

// Handle OPTIONS and accidental GETs so React Router & preflight are happy
export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    // Preflight: tell the browser it’s allowed to POST here
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: corsHeaders,
  });
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const { orderGid, templateId, subjectOverride, bodyOverride } =
      await request.json();

    if (!orderGid || !templateId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing order or template" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // 1) Load the template
    const template = await db.emailTemplate.findUnique({
      where: { id: Number(templateId) },
    });

    if (!template) {
      return new Response(
        JSON.stringify({ ok: false, error: "Template not found" }),
        { status: 404, headers: corsHeaders },
      );
    }

    const subject = subjectOverride || template.subject;
    const bodyHtml = bodyOverride || template.bodyHtml;

    // 2) DEV ONLY: pretend to send the email
    console.log("[EmailCenter] (DEV) would send email:", {
      orderGid,
      templateId,
      subject,
    });

    // 3) Log to EmailLog
    const log = await db.emailLog.create({
      data: {
        orderGid,
        templateId: template.id,
        subject,
        bodyHtml,
      },
    });

    // 4) Success response
    return new Response(JSON.stringify({ ok: true, log }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("[EmailCenter] /api/email/send error", err);

    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: corsHeaders },
    );
  }
};
