// app/routes/api.email.logs.jsx
import db from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const orderGid = url.searchParams.get("orderGid");

  // Handle preflight if browser ever OPTIONS this route
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (!orderGid) {
    return new Response(
      JSON.stringify({ error: "Missing orderGid" }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  try {
    const logs = await db.emailLog.findMany({
      where: { orderGid: String(orderGid) },
      orderBy: { sentAt: "desc" },
      include: {
        template: { select: { label: true } },
      },
    });

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("[EmailCenter] /api/email/logs error", err);

    return new Response(
      JSON.stringify({ error: "Failed to load logs" }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
};
