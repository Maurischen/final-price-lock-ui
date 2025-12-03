import { authenticate } from "../shopify.server";
import db from "../db.server";

// Legacy handler for old /webhooks/app_uninstalled URL
export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(
    `(Legacy) Received ${topic} webhook at /webhooks/app_uninstalled for ${shop}`
  );

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};

export const loader = () => new Response("OK");
