import { useActionData, useNavigation, Form } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Checkbox,
  TextField,
  Banner,
  DataTable,
  Badge,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "../../shopify.server";

import {
  fetchProductsForAiEnrichment,
  generateAiProductMetafields,
  buildAiMetafieldsForShopify,
  writeAiMetafields,
  getExistingAiMetafields,
  hasExistingAiMetafields,
} from "../../services/ai-product-enrichment.server";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();

  const dryRun = formData.get("dryRun") === "true";
  const overwrite = formData.get("overwrite") === "true";
  const onlyMissing = formData.get("onlyMissing") === "true";
  const limit = Number(formData.get("limit") || 5);

  const safeLimit = Math.min(Math.max(limit, 1), 25);

  const productsResult = await fetchProductsForAiEnrichment(admin, {
    first: safeLimit,
    onlyActive: true,
  });

  const products = productsResult.nodes || [];

  const results = [];

  for (const product of products) {
    try {
      const existingAiData = getExistingAiMetafields(product);
      const alreadyHasAi = hasExistingAiMetafields(product);

      if (onlyMissing && alreadyHasAi && !overwrite) {
        results.push({
          title: product.title,
          sku: product.selectedOrFirstAvailableVariant?.sku || "",
          status: "Skipped",
          message: "AI metafields already exist.",
          generated: existingAiData,
          written: 0,
        });

        continue;
      }

      const generated = await generateAiProductMetafields(product);

      const metafieldsToWrite = buildAiMetafieldsForShopify(product.id, generated, {
        overwrite,
        existingAiData,
      });

      let writeResult = {
        written: 0,
        userErrors: [],
      };

      if (!dryRun && metafieldsToWrite.length > 0) {
        writeResult = await writeAiMetafields(admin, metafieldsToWrite);
      }

      results.push({
        title: product.title,
        sku: product.selectedOrFirstAvailableVariant?.sku || "",
        status: dryRun ? "Preview" : "Processed",
        message: dryRun
          ? `${metafieldsToWrite.length} metafields ready to write.`
          : `${writeResult.written} metafields written.`,
        generated,
        written: writeResult.written,
        userErrors: writeResult.userErrors,
      });
    } catch (error) {
      results.push({
        title: product.title,
        sku: product.selectedOrFirstAvailableVariant?.sku || "",
        status: "Error",
        message: error.message,
        generated: {},
        written: 0,
      });
    }
  }

  return {
    dryRun,
    overwrite,
    onlyMissing,
    limit: safeLimit,
    total: results.length,
    results,
  };
}

export default function AiEnrichmentPage() {
  const actionData = useActionData();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  const rows =
    actionData?.results?.map((item) => [
      item.title,
      item.sku || "-",
      <Badge
        tone={
          item.status === "Error"
            ? "critical"
            : item.status === "Skipped"
              ? "attention"
              : "success"
        }
      >
        {item.status}
      </Badge>,
      item.message,
    ]) || [];

  return (
    <Page title="AI Product Enrichment">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Generate AI/GEO metafields
              </Text>

              <Text as="p" tone="subdued">
                This tool reads product data, generates structured AI metafield values, and writes them to Shopify as custom.ai_* metafields.
              </Text>

              <Banner tone="info">
                Dry run is enabled by default. Test with 5 products first before writing live data.
              </Banner>

              <Form method="post">
                <BlockStack gap="400">
                  <TextField
                    label="Number of products to process"
                    name="limit"
                    type="number"
                    defaultValue="5"
                    min={1}
                    max={25}
                    helpText="Start small. Maximum 25 per run for safety."
                  />

                  <input type="hidden" name="dryRun" value="true" />
                  <input type="hidden" name="onlyMissing" value="true" />
                  <input type="hidden" name="overwrite" value="false" />

                  <InlineStack gap="300">
                    <Button submit loading={isSubmitting} variant="primary">
                      Dry Run Preview
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Form>

              <Divider />

              <Form method="post">
                <BlockStack gap="400">
                  <input type="hidden" name="dryRun" value="false" />
                  <input type="hidden" name="onlyMissing" value="true" />
                  <input type="hidden" name="overwrite" value="false" />
                  <input type="hidden" name="limit" value="5" />

                  <Button submit loading={isSubmitting} tone="success">
                    Write 5 Missing Products
                  </Button>

                  <Text as="p" tone="subdued">
                    This writes only blank/missing AI metafields and skips products that already have AI data.
                  </Text>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        {actionData?.results?.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Results
                </Text>

                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Product", "SKU", "Status", "Message"]}
                  rows={rows}
                />

                {actionData.results.map((item, index) => (
                  <Card key={`${item.sku}-${index}`} background="bg-surface-secondary">
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text as="h3" variant="headingSm">
                          {item.title}
                        </Text>
                        <Badge>{item.sku || "No SKU"}</Badge>
                      </InlineStack>

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
                        {JSON.stringify(item.generated, null, 2)}
                      </pre>

                      {item.userErrors?.length > 0 && (
                        <Banner tone="critical">
                          {JSON.stringify(item.userErrors, null, 2)}
                        </Banner>
                      )}
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