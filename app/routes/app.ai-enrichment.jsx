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
import {
  generateAiProductMetafields,
  buildAiMetafieldsForShopify,
  writeAiMetafields,
} from "../services/ai-product-enrichment.server";

export async function loader({ request }) {
  await authenticate.admin(request);
  return null;
}

export async function action({ request }) {
  console.log("AI ENRICHMENT WRITE ACTION FIRED");

  try {
    const { admin } = await authenticate.admin(request);

    const formData = await request.formData();
    const limit = Number(formData.get("limit") || 1);
    const intent = formData.get("intent");
    const dryRun = intent !== "write";
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
            metafields(first: 20, namespace: "custom") {
              nodes {
                namespace
                key
                value
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
        const existingAiData = Object.fromEntries(
          (product.metafields?.nodes || [])
            .filter((field) => field.key?.startsWith("ai_"))
            .map((field) => [field.key.replace(/^ai_/, ""), field.value])
        );

        const aiData = await generateAiProductMetafields(product);

        const metafieldsToWrite = buildAiMetafieldsForShopify(product.id, aiData, {
          overwrite: false,
          existingAiData,
        });

        let writeResult = {
          written: 0,
          userErrors: [],
        };

        if (!dryRun && metafieldsToWrite.length > 0) {
          writeResult = await writeAiMetafields(admin, metafieldsToWrite);
        }

        enriched.push({
          title: product.title,
          handle: product.handle,
          sku: product.variants?.nodes?.[0]?.sku || "",
          status: writeResult.userErrors?.length ? "Error" : dryRun ? "Preview" : "Written",
          aiData,
          metafieldsReady: metafieldsToWrite.length,
          written: writeResult.written,
          userErrors: writeResult.userErrors,
          error: null,
        });
      } catch (error) {
        enriched.push({
          title: product.title,
          handle: product.handle,
          sku: product.variants?.nodes?.[0]?.sku || "",
          status: "Error",
          aiData: null,
          metafieldsReady: 0,
          written: 0,
          userErrors: [],
          error: error.message,
        });
      }
    }

    return {
      ok: true,
      message: dryRun
        ? `Previewed ${products.length} product(s). Nothing was written.`
        : `Processed ${products.length} product(s).`,
      enriched,
    };
  } catch (error) {
    console.error("AI ENRICHMENT WRITE ERROR:", error);

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
                AI Product Enrichment
              </Text>

              <Text as="p" tone="subdued">
                Generate and write custom.ai_* metafields for active Shopify products.
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

                  <Button submit name="intent" value="preview" loading={isSubmitting} variant="primary">
                    Generate Preview
                  </Button>

                  <Button submit name="intent" value="write" loading={isSubmitting} tone="success">
                    Write to Shopify Metafields
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
                  Results
                </Text>

                {actionData.enriched.map((item, index) => (
                  <Card key={`${item.sku || item.handle}-${index}`} background="bg-surface-secondary">
                    <BlockStack gap="300">
                      <div>
                        <Text as="h3" variant="headingSm">
                          {item.title}
                        </Text>

                        <div style={{ marginTop: "6px" }}>
                          <Badge
                            tone={
                              item.status === "Error"
                                ? "critical"
                                : item.status === "Preview"
                                  ? "info"
                                  : "success"
                            }
                          >
                            {item.status}
                          </Badge>
                        </div>

                        <Text as="p" tone="subdued">
                          SKU: {item.sku || "No SKU"} | Ready: {item.metafieldsReady} | Written: {item.written}
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
                        {JSON.stringify(item.aiData || item.error || item.userErrors, null, 2)}
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