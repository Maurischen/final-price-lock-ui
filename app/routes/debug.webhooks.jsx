import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session, shop } = await authenticate.admin(request);

  const result = await admin.graphql(`
    {
      webhookSubscriptions(first: 20) {
        edges {
          node {
            id
            topic
            callbackUrl
            format
          }
        }
      }
    }
  `);

  console.log(
    "[DEBUG] Webhook subscriptions for",
    shop,
    JSON.stringify(result, null, 2)
  );

  return new Response("OK");
};
