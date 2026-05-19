import { generateAiProductMetafields } from "../services/ai-product-enrichment.server";
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
          vendor
          productType
          descriptionHtml
          tags
          handle
          selectedOrFirstAvailableVariant {
            sku
          }
        }
      }
    }
  `);

  const json = await response.json();

  const products = json.data.products.nodes;

  const enriched = [];

  for (const product of products) {
    try {
      const aiData = await generateAiProductMetafields(product);

      enriched.push({
        title: product.title,
        handle: product.handle,
        aiData,
      });
    } catch (error) {
      enriched.push({
        title: product.title,
        handle: product.handle,
        error: error.message,
      });
    }
  }

  return {
    ok: true,
    message: `Processed ${products.length} products.`,
    enriched,
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
            
              {actionData?.enriched?.length > 0 && (
                <div style={{ marginTop: "20px" }}>
                  {actionData.enriched.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        padding: "15px",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        marginBottom: "15px",
                        background: "#f9f9f9",
                      }}
                    >
                      <strong>{item.title}</strong>

                      <pre
                        style={{
                          marginTop: "10px",
                          whiteSpace: "pre-wrap",
                          overflowX: "auto",
                          fontSize: "12px",
                        }}
                      >
                        {JSON.stringify(item.aiData || item.error, null, 2)}
                      </pre>
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