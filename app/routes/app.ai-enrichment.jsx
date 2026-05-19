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
  await authenticate.admin(request);

  const formData = await request.formData();
  const limit = formData.get("limit") || "5";

  return {
    ok: true,
    message: `Test successful. Limit received: ${limit}`,
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