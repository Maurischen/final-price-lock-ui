import { redirect } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Select,
  DataTable,
  Badge,
  Banner,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import {
  listPromoDisplayRules,
  upsertPromoDisplayRule,
  disablePromoDisplayRule,
  deletePromoDisplayRule,
} from "../services/promo-display.server";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  const rules = await listPromoDisplayRules(session.shop);

  return Response.json({ rules });
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("_intent");

  try {
    if (intent === "save") {
      const sku = String(formData.get("sku") || "").trim();
      const source = String(formData.get("source") || "STANDALONE").trim();
      const discountType = String(formData.get("discountType") || "FIXED").trim();
      const label = String(formData.get("label") || "").trim();
      const priority = Number(formData.get("priority") || 100);
      const isEnabled = formData.get("isEnabled") === "on";

      const amountRand = Number(formData.get("discountAmount") || 0);
      const percent = Number(formData.get("discountPercent") || 0);

      if (!sku) {
        return Response.json({ error: "SKU is required." }, { status: 400 });
      }

      if (discountType === "FIXED" && amountRand <= 0) {
        return Response.json({ error: "Fixed discount amount must be more than 0." }, { status: 400 });
      }

      if (discountType === "PERCENTAGE" && percent <= 0) {
        return Response.json({ error: "Percentage discount must be more than 0." }, { status: 400 });
      }

      await upsertPromoDisplayRule({
        admin,
        shop: session.shop,
        source,
        sku,
        discountType,
        discountAmount: discountType === "FIXED" ? Math.round(amountRand * 100) : null,
        discountPercent: discountType === "PERCENTAGE" ? percent : null,
        label,
        priority,
        isEnabled,
      });

      return redirect("/app/promo-display");
    }

    if (intent === "disable") {
      const id = String(formData.get("id") || "");

      await disablePromoDisplayRule({
        admin,
        shop: session.shop,
        id,
      });

      return redirect("/app/promo-display");
    }

    if (intent === "delete") {
      const id = String(formData.get("id") || "");

      await deletePromoDisplayRule({
        admin,
        shop: session.shop,
        id,
      });

      return redirect("/app/promo-display");
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || "Something went wrong." }, { status: 500 });
  }
}

export default function PromoDisplayPage() {
  const { rules } = useLoaderData();
  const actionData = useActionData();

  const rows = rules.map((rule) => [
    rule.sku,
    rule.source,
    rule.discountType,
    rule.discountType === "FIXED"
      ? `R ${(Number(rule.discountAmount || 0) / 100).toFixed(2)}`
      : `${rule.discountPercent}%`,
    rule.label || "-",
    rule.priority,
    rule.isEnabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="critical">Disabled</Badge>,
    <InlineStack gap="200" key={rule.id}>
      {rule.isEnabled && (
        <Form method="post">
          <input type="hidden" name="_intent" value="disable" />
          <input type="hidden" name="id" value={rule.id} />
          <Button submit size="slim">Disable</Button>
        </Form>
      )}

      <Form method="post">
        <input type="hidden" name="_intent" value="delete" />
        <input type="hidden" name="id" value={rule.id} />
        <Button submit size="slim" tone="critical">Delete</Button>
      </Form>
    </InlineStack>,
  ]);

  return (
    <Page title="Promo Display Rules">
      <Layout>
        <Layout.Section>
          {actionData?.error && (
            <Banner tone="critical">
              <p>{actionData.error}</p>
            </Banner>
          )}
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Add / Update Promo Display Rule
              </Text>

              <Form method="post">
                <input type="hidden" name="_intent" value="save" />

                <BlockStack gap="300">
                  <TextField
                    label="SKU"
                    name="sku"
                    autoComplete="off"
                    placeholder="Example: ABC-123"
                    requiredIndicator
                  />

                  <Select
                    label="Promo source"
                    name="source"
                    options={[
                      { label: "Standalone", value: "STANDALONE" },
                      { label: "Bundle", value: "BUNDLE" },
                      { label: "Upsell", value: "UPSELL" },
                      { label: "Pre-loved", value: "PRE_LOVED" },
                    ]}
                  />

                  <Select
                    label="Discount type"
                    name="discountType"
                    options={[
                      { label: "Fixed amount", value: "FIXED" },
                      { label: "Percentage", value: "PERCENTAGE" },
                    ]}
                  />

                  <TextField
                    label="Fixed discount amount in Rand"
                    name="discountAmount"
                    type="number"
                    step="0.01"
                    autoComplete="off"
                    placeholder="101.00"
                    helpText="Example: 101.00 will display as SAVE R101.00"
                  />

                  <TextField
                    label="Percentage discount"
                    name="discountPercent"
                    type="number"
                    step="0.01"
                    autoComplete="off"
                    placeholder="25"
                    helpText="Only used when discount type is Percentage."
                  />

                  <TextField
                    label="Display label"
                    name="label"
                    autoComplete="off"
                    placeholder="SAVE R101"
                    helpText="Optional. If blank, the theme can fall back to the amount."
                  />

                  <TextField
                    label="Priority"
                    name="priority"
                    type="number"
                    autoComplete="off"
                    value="100"
                    helpText="Lower number wins if you later sync multiple promo sources."
                  />

                  <label>
                    <input type="checkbox" name="isEnabled" defaultChecked /> Enabled
                  </label>

                  <Button submit variant="primary">
                    Save promo display
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Existing Rules
              </Text>

              {rules.length === 0 ? (
                <Text as="p">No promo display rules yet.</Text>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "text",
                    "text",
                    "numeric",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "SKU",
                    "Source",
                    "Type",
                    "Discount",
                    "Label",
                    "Priority",
                    "Status",
                    "Actions",
                  ]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}