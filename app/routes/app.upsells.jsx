import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Checkbox,
  Button,
  InlineStack,
  BlockStack,
  Badge,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  listUpsellRules,
  createUpsellRule,
  deleteUpsellRule,
  setUpsellRuleActive,
} from "../services/upsell-rules.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const rules = await listUpsellRules(session.shop);

  return Response.json({
    shop: session.shop,
    rules,
  });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "create") {
      const result = await createUpsellRule(session.shop, {
        name: formData.get("name"),
        type: formData.get("type"),
        placement: formData.get("placement"),
        triggerMode: formData.get("triggerMode"),
        triggerProductId: formData.get("triggerProductId"),
        triggerVariantId: formData.get("triggerVariantId"),
        triggerSku: formData.get("triggerSku"),
        triggerTag: formData.get("triggerTag"),
        minCartValue: formData.get("minCartValue"),
        maxCartValue: formData.get("maxCartValue"),
        offerMode: formData.get("offerMode"),
        offerProductId: formData.get("offerProductId"),
        offerVariantId: formData.get("offerVariantId"),
        offerSku: formData.get("offerSku"),
        offerTitleOverride: formData.get("offerTitleOverride"),
        offerMessage: formData.get("offerMessage"),
        discountMode: formData.get("discountMode"),
        discountValue: formData.get("discountValue"),
        discountLabel: formData.get("discountLabel"),
        priority: formData.get("priority"),
        isActive: formData.get("isActive"),
        limitOnePerCart: formData.get("limitOnePerCart"),
        hideIfOfferInCart: formData.get("hideIfOfferInCart"),
        hideIfOfferOutOfStock: formData.get("hideIfOfferOutOfStock"),
        startsAt: formData.get("startsAt"),
        endsAt: formData.get("endsAt"),
      });

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "delete") {
      const id = formData.get("id");
      const result = await deleteUpsellRule(id, session.shop);

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "toggle-active") {
      const id = formData.get("id");
      const isActive = formData.get("isActive") === "true";
      const result = await setUpsellRuleActive(id, session.shop, isActive);

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    return Response.json(
      { ok: false, error: "Unknown action." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Upsell action error:", error);
    return Response.json(
      {
        ok: false,
        error: error?.message || "Something went wrong.",
      },
      { status: 500 },
    );
  }
}

function RuleCard({ rule }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h3" variant="headingMd">
              {rule.name}
            </Text>
            <InlineStack gap="200">
              <Badge>{rule.type}</Badge>
              <Badge tone="info">{rule.placement}</Badge>
              <Badge tone={rule.isActive ? "success" : undefined}>
                {rule.isActive ? "Active" : "Inactive"}
              </Badge>
            </InlineStack>
          </BlockStack>

          <InlineStack gap="200">
            <Form method="post">
              <input type="hidden" name="intent" value="toggle-active" />
              <input type="hidden" name="id" value={rule.id} />
              <input
                type="hidden"
                name="isActive"
                value={rule.isActive ? "false" : "true"}
              />
              <Button submit variant="secondary">
                {rule.isActive ? "Disable" : "Enable"}
              </Button>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={rule.id} />
              <Button submit tone="critical" variant="secondary">
                Delete
              </Button>
            </Form>
          </InlineStack>
        </InlineStack>

        <Divider />

        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            <strong>Trigger:</strong> {rule.triggerMode}
          </Text>

          {rule.triggerProductId ? (
            <Text as="p" variant="bodySm">Product ID: {rule.triggerProductId}</Text>
          ) : null}
          {rule.triggerVariantId ? (
            <Text as="p" variant="bodySm">Variant ID: {rule.triggerVariantId}</Text>
          ) : null}
          {rule.triggerSku ? (
            <Text as="p" variant="bodySm">SKU: {rule.triggerSku}</Text>
          ) : null}
          {rule.triggerTag ? (
            <Text as="p" variant="bodySm">Tag: {rule.triggerTag}</Text>
          ) : null}

          <Text as="p" variant="bodyMd">
            <strong>Offer:</strong> {rule.offerMode}
          </Text>

          {rule.offerProductId ? (
            <Text as="p" variant="bodySm">Offer Product ID: {rule.offerProductId}</Text>
          ) : null}
          {rule.offerVariantId ? (
            <Text as="p" variant="bodySm">Offer Variant ID: {rule.offerVariantId}</Text>
          ) : null}
          {rule.offerSku ? (
            <Text as="p" variant="bodySm">Offer SKU: {rule.offerSku}</Text>
          ) : null}

          {rule.discountMode !== "NONE" ? (
            <Text as="p" variant="bodySm">
              Discount: {rule.discountMode} {rule.discountValue ?? ""}
            </Text>
          ) : null}

          {rule.offerMessage ? (
            <Text as="p" variant="bodySm">Message: {rule.offerMessage}</Text>
          ) : null}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

export default function UpsellsPage() {
  const { shop, rules } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <Page
      title="Upsells & Cross-sells"
      subtitle={`Manage upsell rules for ${shop}`}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Create rule
              </Text>

              {actionData?.error ? (
                <Text as="p" tone="critical">
                  {actionData.error}
                </Text>
              ) : null}

              {actionData?.errors ? (
                <BlockStack gap="100">
                  {Object.entries(actionData.errors).map(([key, value]) => (
                    <Text key={key} as="p" tone="critical">
                      {value}
                    </Text>
                  ))}
                </BlockStack>
              ) : null}

              {actionData?.ok ? (
                <Text as="p" tone="success">
                  Rule saved successfully.
                </Text>
              ) : null}

              <Form method="post">
                <input type="hidden" name="intent" value="create" />

                <BlockStack gap="400">
                  <TextField
                    label="Rule name"
                    name="name"
                    autoComplete="off"
                  />

                  <InlineStack gap="300" wrap>
                    <div style={{ minWidth: 220 }}>
                      <Select
                        label="Type"
                        name="type"
                        options={[
                          { label: "Cross-sell", value: "CROSS_SELL" },
                          { label: "Upsell", value: "UPSELL" },
                        ]}
                      />
                    </div>

                    <div style={{ minWidth: 220 }}>
                      <Select
                        label="Placement"
                        name="placement"
                        options={[
                          { label: "Product page", value: "PRODUCT_PAGE" },
                          { label: "Cart", value: "CART" },
                          { label: "Cart drawer", value: "CART_DRAWER" },
                          { label: "Post add", value: "POST_ADD" },
                        ]}
                      />
                    </div>

                    <div style={{ minWidth: 220 }}>
                      <Select
                        label="Trigger mode"
                        name="triggerMode"
                        options={[
                          { label: "SKU", value: "SKU" },
                          { label: "Product", value: "PRODUCT" },
                          { label: "Variant", value: "VARIANT" },
                          { label: "Tag", value: "TAG" },
                          { label: "Cart value", value: "CART_VALUE" },
                        ]}
                      />
                    </div>

                    <div style={{ minWidth: 220 }}>
                      <Select
                        label="Offer mode"
                        name="offerMode"
                        options={[
                          { label: "Product", value: "PRODUCT" },
                          { label: "Variant", value: "VARIANT" },
                          { label: "SKU", value: "SKU" },
                        ]}
                      />
                    </div>
                  </InlineStack>

                  <InlineStack gap="300" wrap>
                    <TextField
                      label="Trigger product ID"
                      name="triggerProductId"
                      autoComplete="off"
                    />
                    <TextField
                      label="Trigger variant ID"
                      name="triggerVariantId"
                      autoComplete="off"
                    />
                  </InlineStack>

                  <InlineStack gap="300" wrap>
                    <TextField
                      label="Trigger SKU"
                      name="triggerSku"
                      autoComplete="off"
                    />
                    <TextField
                      label="Trigger tag"
                      name="triggerTag"
                      autoComplete="off"
                    />
                  </InlineStack>

                  <InlineStack gap="300" wrap>
                    <TextField
                      label="Min cart value"
                      name="minCartValue"
                      type="number"
                      autoComplete="off"
                    />
                    <TextField
                      label="Max cart value"
                      name="maxCartValue"
                      type="number"
                      autoComplete="off"
                    />
                  </InlineStack>

                  <InlineStack gap="300" wrap>
                    <TextField
                      label="Offer product ID"
                      name="offerProductId"
                      autoComplete="off"
                    />
                    <TextField
                      label="Offer variant ID"
                      name="offerVariantId"
                      autoComplete="off"
                    />
                    <TextField
                      label="Offer SKU"
                      name="offerSku"
                      autoComplete="off"
                    />
                  </InlineStack>

                  <InlineStack gap="300" wrap>
                    <TextField
                      label="Offer title override"
                      name="offerTitleOverride"
                      autoComplete="off"
                    />
                    <TextField
                      label="Offer message"
                      name="offerMessage"
                      autoComplete="off"
                    />
                  </InlineStack>

                  <InlineStack gap="300" wrap>
                    <div style={{ minWidth: 220 }}>
                      <Select
                        label="Discount mode"
                        name="discountMode"
                        options={[
                          { label: "None", value: "NONE" },
                          { label: "Fixed", value: "FIXED" },
                          { label: "Percentage", value: "PERCENTAGE" },
                        ]}
                      />
                    </div>

                    <TextField
                      label="Discount value"
                      name="discountValue"
                      type="number"
                      autoComplete="off"
                    />

                    <TextField
                      label="Discount label"
                      name="discountLabel"
                      autoComplete="off"
                    />
                  </InlineStack>

                  <InlineStack gap="300" wrap>
                    <TextField
                      label="Priority"
                      name="priority"
                      type="number"
                      autoComplete="off"
                    />
                    <TextField
                      label="Starts at"
                      name="startsAt"
                      type="datetime-local"
                      autoComplete="off"
                    />
                    <TextField
                      label="Ends at"
                      name="endsAt"
                      type="datetime-local"
                      autoComplete="off"
                    />
                  </InlineStack>

                  <InlineStack gap="500" wrap>
                    <label>
                      <input type="hidden" name="isActive" value="false" />
                      <Checkbox
                        label="Active"
                        name="isActive"
                        value="true"
                      />
                    </label>

                    <label>
                      <input type="hidden" name="limitOnePerCart" value="false" />
                      <Checkbox
                        label="Limit one per cart"
                        name="limitOnePerCart"
                        value="true"
                        defaultChecked
                      />
                    </label>

                    <label>
                      <input type="hidden" name="hideIfOfferInCart" value="false" />
                      <Checkbox
                        label="Hide if offer already in cart"
                        name="hideIfOfferInCart"
                        value="true"
                        defaultChecked
                      />
                    </label>

                    <label>
                      <input
                        type="hidden"
                        name="hideIfOfferOutOfStock"
                        value="false"
                      />
                      <Checkbox
                        label="Hide if offer is out of stock"
                        name="hideIfOfferOutOfStock"
                        value="true"
                        defaultChecked
                      />
                    </label>
                  </InlineStack>

                  <InlineStack align="end">
                    <Button submit variant="primary" loading={isSubmitting}>
                      Save rule
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Existing rules
            </Text>

            {rules.length === 0 ? (
              <Card>
                <Text as="p" variant="bodyMd">
                  No upsell rules yet.
                </Text>
              </Card>
            ) : (
              rules.map((rule) => <RuleCard key={rule.id} rule={rule} />)
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}