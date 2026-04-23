import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
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

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  marginBottom: "6px",
};

const fieldWrapStyle = {
  minWidth: "220px",
  flex: "1 1 220px",
};

function Field({ label, children }) {
  return (
    <div style={fieldWrapStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
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
            <Text as="p" variant="bodySm">
              Product ID: {rule.triggerProductId}
            </Text>
          ) : null}

          {rule.triggerVariantId ? (
            <Text as="p" variant="bodySm">
              Variant ID: {rule.triggerVariantId}
            </Text>
          ) : null}

          {rule.triggerSku ? (
            <Text as="p" variant="bodySm">
              SKU: {rule.triggerSku}
            </Text>
          ) : null}

          {rule.triggerTag ? (
            <Text as="p" variant="bodySm">
              Tag: {rule.triggerTag}
            </Text>
          ) : null}

          {(rule.minCartValue != null || rule.maxCartValue != null) && (
            <Text as="p" variant="bodySm">
              Cart value: {rule.minCartValue ?? "-"} to {rule.maxCartValue ?? "-"}
            </Text>
          )}

          <Text as="p" variant="bodyMd">
            <strong>Offer:</strong> {rule.offerMode}
          </Text>

          {rule.offerProductId ? (
            <Text as="p" variant="bodySm">
              Offer Product ID: {rule.offerProductId}
            </Text>
          ) : null}

          {rule.offerVariantId ? (
            <Text as="p" variant="bodySm">
              Offer Variant ID: {rule.offerVariantId}
            </Text>
          ) : null}

          {rule.offerSku ? (
            <Text as="p" variant="bodySm">
              Offer SKU: {rule.offerSku}
            </Text>
          ) : null}

          {rule.discountMode !== "NONE" ? (
            <Text as="p" variant="bodySm">
              Discount: {rule.discountMode} {rule.discountValue ?? ""}
              {rule.discountLabel ? ` (${rule.discountLabel})` : ""}
            </Text>
          ) : null}

          {rule.offerMessage ? (
            <Text as="p" variant="bodySm">
              Message: {rule.offerMessage}
            </Text>
          ) : null}

          <Text as="p" variant="bodySm">
            Priority: {rule.priority}
          </Text>
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
                <input type="hidden" name="isActive" value="false" />
                <input type="hidden" name="limitOnePerCart" value="false" />
                <input type="hidden" name="hideIfOfferInCart" value="false" />
                <input type="hidden" name="hideIfOfferOutOfStock" value="false" />

                <BlockStack gap="400">
                  <Field label="Rule name">
                    <input
                      type="text"
                      name="name"
                      style={inputStyle}
                      placeholder="Laptop bag cross-sell"
                    />
                  </Field>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Field label="Type">
                      <select name="type" defaultValue="CROSS_SELL" style={inputStyle}>
                        <option value="CROSS_SELL">Cross-sell</option>
                        <option value="UPSELL">Upsell</option>
                      </select>
                    </Field>

                    <Field label="Placement">
                      <select
                        name="placement"
                        defaultValue="PRODUCT_PAGE"
                        style={inputStyle}
                      >
                        <option value="PRODUCT_PAGE">Product page</option>
                        <option value="CART">Cart</option>
                        <option value="CART_DRAWER">Cart drawer</option>
                        <option value="POST_ADD">Post add</option>
                      </select>
                    </Field>

                    <Field label="Trigger mode">
                      <select
                        name="triggerMode"
                        defaultValue="SKU"
                        style={inputStyle}
                      >
                        <option value="SKU">SKU</option>
                        <option value="PRODUCT">Product</option>
                        <option value="VARIANT">Variant</option>
                        <option value="TAG">Tag</option>
                        <option value="CART_VALUE">Cart value</option>
                      </select>
                    </Field>

                    <Field label="Offer mode">
                      <select
                        name="offerMode"
                        defaultValue="PRODUCT"
                        style={inputStyle}
                      >
                        <option value="PRODUCT">Product</option>
                        <option value="VARIANT">Variant</option>
                        <option value="SKU">SKU</option>
                      </select>
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Field label="Trigger product ID">
                      <input type="text" name="triggerProductId" style={inputStyle} />
                    </Field>

                    <Field label="Trigger variant ID">
                      <input type="text" name="triggerVariantId" style={inputStyle} />
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Field label="Trigger SKU">
                      <input type="text" name="triggerSku" style={inputStyle} />
                    </Field>

                    <Field label="Trigger tag">
                      <input type="text" name="triggerTag" style={inputStyle} />
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Field label="Min cart value">
                      <input
                        type="number"
                        step="0.01"
                        name="minCartValue"
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Max cart value">
                      <input
                        type="number"
                        step="0.01"
                        name="maxCartValue"
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Field label="Offer product ID">
                      <input type="text" name="offerProductId" style={inputStyle} />
                    </Field>

                    <Field label="Offer variant ID">
                      <input type="text" name="offerVariantId" style={inputStyle} />
                    </Field>

                    <Field label="Offer SKU">
                      <input type="text" name="offerSku" style={inputStyle} />
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Field label="Offer title override">
                      <input
                        type="text"
                        name="offerTitleOverride"
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Offer message">
                      <input type="text" name="offerMessage" style={inputStyle} />
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Field label="Discount mode">
                      <select
                        name="discountMode"
                        defaultValue="NONE"
                        style={inputStyle}
                      >
                        <option value="NONE">None</option>
                        <option value="FIXED">Fixed</option>
                        <option value="PERCENTAGE">Percentage</option>
                      </select>
                    </Field>

                    <Field label="Discount value">
                      <input
                        type="number"
                        step="0.01"
                        name="discountValue"
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Discount label">
                      <input type="text" name="discountLabel" style={inputStyle} />
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <Field label="Priority">
                      <input
                        type="number"
                        name="priority"
                        defaultValue="100"
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Starts at">
                      <input
                        type="datetime-local"
                        name="startsAt"
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Ends at">
                      <input
                        type="datetime-local"
                        name="endsAt"
                        style={inputStyle}
                      />
                    </Field>
                  </div>

                  <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="checkbox" name="isActive" value="true" />
                      <span>Active</span>
                    </label>

                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        name="limitOnePerCart"
                        value="true"
                        defaultChecked
                      />
                      <span>Limit one per cart</span>
                    </label>

                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        name="hideIfOfferInCart"
                        value="true"
                        defaultChecked
                      />
                      <span>Hide if offer already in cart</span>
                    </label>

                    <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        name="hideIfOfferOutOfStock"
                        value="true"
                        defaultChecked
                      />
                      <span>Hide if offer is out of stock</span>
                    </label>
                  </div>

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