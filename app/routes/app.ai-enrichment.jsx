import { Form, useActionData, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  Banner,
  Badge,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { generateAiProductMetafields } from "../services/ai-product-enrichment.server";

export async function loader({ request }) {
  await authenticate.admin(request);
  return null;
}

export async function action({ request }) {
  console.log("AI ENRICHMENT ACTION FIRED");

  try {
    const { admin } = await authenticate.admin(request);

    const formData = await request.formData();
    const limit = Number(formData.get("limit") || 1);
    const safeLimit = Math.min(Math.max(limit, 1), 5);

   const response = await admin.graphql(`
  query {
    products(first: ${safeLimit}, query: "status:active") {
      nodes {
        id
        title
        vendor
        productType
        descriptionHtml
        tags
        handle

        variants(first: 1) {
          nodes {
            sku
            barcode
          }
        }
      }
    }
  }
`);

    const json = await response.json();

    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }

    const products = json.data.products.nodes || [];
    const enriched = [];

    for (const product of products) {
      try {
        const aiData = await generateAiProductMetafields(product);

        enriched.push({
          title: product.title,
          handle: product.handle,
          sku: product.variants?.nodes?.[0]?.sku || "",
          status: "Success",
          aiData,
          error: null,
        });
      } catch (error) {
        console.error("AI PRODUCT ERROR:", product.title, error);

        enriched.push({
          title: product.title,
          handle: product.handle,
          sku: product.variants?.nodes?.[0]?.sku || "",
          status: "Error",
          aiData: null,
          error: error.message,
        });
      }
    }

    return {
      ok: true,
      message: `Processed ${products.length} product(s).`,
      enriched,
    };
  } catch (error) {
    console.error("AI ENRICHMENT ACTION ERROR:", error);

    return {
      ok: false,
      message: error.message || "Unknown server error.",
      enriched: [],
    };
  }
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
                This test fetches active Shopify products, sends them to OpenAI,
                and previews the generated custom.ai_* metafield data. Nothing is
                written to Shopify yet.
              </Text>

              {actionData && (
                <Banner tone={actionData.ok ? "success" : "critical"}>
                  {actionData.message}
                </Banner>
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
                      defaultValue="1"
                      min="1"
                      max="5"
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
                    Generate Preview
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData?.enriched?.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  AI Preview Results
                </Text>

                {actionData.enriched.map((item, index) => (
                  <Card key={`${item.sku || item.handle}-${index}`} background="bg-surface-secondary">
                    <BlockStack gap="300">
                      <div>
                        <Text as="h3" variant="headingSm">
                          {item.title}
                        </Text>

                        <div style={{ marginTop: "6px" }}>
                          <Badge tone={item.status === "Error" ? "critical" : "success"}>
                            {item.status}
                          </Badge>
                        </div>

                        <Text as="p" tone="subdued">
                          SKU: {item.sku || "No SKU"} | Handle: {item.handle}
                        </Text>
                      </div>

                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          overflowX: "auto",
                          fontSize: "12px",
                          padding: "12px",
                          background: "#f6f6f7",
                          borderRadius: "8px",
                        }}
                      >
                        {JSON.stringify(item.aiData || item.error, null, 2)}
                      </pre>
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}