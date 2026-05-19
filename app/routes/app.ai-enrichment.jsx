import { Form, useActionData, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  Banner,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  await authenticate.admin(request);
  return null;
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const limit = Number(formData.get("limit") || 5);

  const response = await admin.graphql(`
    query {
      products(first: ${limit}) {
        nodes {
          id
          title
          handle
        }
      }
    }
  `);

  const json = await response.json();

   return {
    ok: true,
    message: `Fetched ${json.data.products.nodes.length} products.`,
    products: json.data.products.nodes,
  };
}

export default function AiEnrichmentPage() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <Page title="AI Product Enrichment">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                AI Product Enrichment Test
              </Text>

              <Text as="p" tone="subdued">
                This confirms the route and form action are working.
              </Text>

              {actionData?.ok && (
                <Banner tone="success">{actionData.message}</Banner>
              )}

              {actionData?.products?.length > 0 && (
                <div style={{ marginTop: "20px" }}>
                  {actionData.products.map((product) => (
                    <div
                      key={product.id}
                      style={{
                        padding: "10px",
                        border: "1px solid #ddd",
                        borderRadius: "6px",
                        marginBottom: "10px",
                      }}
                    >
                      <strong>{product.title}</strong>
                      <br />
                      {product.handle}
                    </div>
                  ))}
                </div>
              )}

              <Form method="post">
                <BlockStack gap="400">
                  <label>
                    <Text as="span" variant="bodyMd">
                      Number of products to process
                    </Text>

                    <input
                      name="limit"
                      type="number"
                      defaultValue="5"
                      min="1"
                      max="25"
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: "8px",
                        padding: "10px",
                        border: "1px solid #c9cccf",
                        borderRadius: "6px",
                      }}
                    />
                  </label>

                  <Button submit loading={isSubmitting} variant="primary">
                    Test Route
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}