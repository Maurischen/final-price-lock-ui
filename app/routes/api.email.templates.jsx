// app/routes/api.email.templates.jsx
import db from "../db.server";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*", // for dev; you can lock this down later
};

export const loader = async () => {
  try {
    console.log("[EmailCenter] loader hit: /api/email/templates");

    const templates = await db.emailTemplate.findMany({
      orderBy: { label: "asc" },
    });

    console.log("[EmailCenter] templates from DB:", templates);

    return new Response(JSON.stringify({ templates }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("[EmailCenter] /api/email/templates error", err);

    return new Response(
      JSON.stringify({ error: "Failed to load templates" }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
};
