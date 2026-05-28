import { json, redirect } from "@shopify/shopify-app-react-router/server";
import { Form, useLoaderData, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Checkbox,
  Divider,
  Badge,
} from "@shopify/polaris";

import { authenticate } from "../../shopify.server";
import {
  listBundlerRules,
  createBundlerRule,
  updateBundlerRule,
  deleteBundlerRule,
  parseSkuList,
  safeJsonArray,
} from "../../services/bundler-rules.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const rules = await listBundlerRules(session.shop);

  return json({ rules });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("_intent");
  const id = formData.get("id");

  if (intent === "delete") {
    await deleteBundlerRule({
      id,
      shop: session.shop,
    });

    return redirect("/app/bundler-rules");
  }

  const name = String(formData.get("name") || "").trim();
  const triggerSkus = parseSkuList(formData.get("triggerSkus"));
  const offerSkus = parseSkuList(formData.get("offerSkus"));
  const isActive = formData.get("isActive") === "on";
  const priority = Number(formData.get("priority") || 100);

  if (!name || triggerSkus.length === 0 || offerSkus.length === 0) {
    return json(
      {
        error:
          "Rule name, at least one trigger SKU, and at least one offer SKU are required.",
      },
      { status: 400 },
    );
  }

  if (intent === "update") {
    await updateBundlerRule({
      id,
      shop: session.shop,
      name,
      triggerSkus,
      offerSkus,
      isActive,
      priority,
    });

    return redirect("/app/bundler-rules");
  }

  await createBundlerRule({
    shop: session.shop,
    name,
    triggerSkus,
    offerSkus,
    isActive,
    priority,
  });

  return redirect("/app/bundler-rules");
}

export default function BundlerRulesPage() {
  const { rules } = useLoaderData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <Page title="Bundler Rules">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Create Bundler Rule
              </Text>

              <Form method="post">
                <input type="hidden" name="_intent" value="create" />

                <BlockStack gap="300">
                  <TextField
                    label="Rule Name"
                    name="name"
                    autoComplete="off"
                    placeholder="Example: T54 Laptop Accessory Bundle"
                  />

                  <TextField
                    label="Trigger SKUs"
                    name="triggerSkus"
                    multiline={4}
                    autoComplete="off"
                    helpText="Comma separated or one SKU per line. Any one of these products will trigger the bundle."
                    placeholder={"LAPTOP-SKU-1\nLAPTOP-SKU-2\nLAPTOP-SKU-3"}
                  />

                  <TextField
                    label="Offer SKUs"
                    name="offerSkus"
                    multiline={4}
                    autoComplete="off"
                    helpText="Comma separated or one SKU per line. These products will show in the bundle."
                    placeholder={"BAG-001\nMOUSE-001\nT54"}
                  />

                  <TextField
                    label="Priority"
                    name="priority"
                    type="number"
                    autoComplete="off"
                    defaultValue="100"
                  />

                  <Checkbox label="Active" name="isActive" defaultChecked />

                  <InlineStack>
                    <Button submit variant="primary" loading={isSubmitting}>
                      Save Bundler Rule
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="400">
            {rules.map((rule) => {
              const triggerSkus = safeJsonArray(rule.triggerSkusJson);
              const offerSkus = safeJsonArray(rule.offerSkusJson);

              return (
                <Card key={rule.id}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <BlockStack gap="100">
                        <Text as="h3" variant="headingMd">
                          {rule.name}
                        </Text>
                        <InlineStack gap="200">
                          <Badge tone={rule.isActive ? "success" : "critical"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge>Priority {rule.priority}</Badge>
                        </InlineStack>
                      </BlockStack>
                    </InlineStack>

                    <Divider />

                    <Form method="post">
                      <input type="hidden" name="_intent" value="update" />
                      <input type="hidden" name="id" value={rule.id} />

                      <BlockStack gap="300">
                        <TextField
                          label="Rule Name"
                          name="name"
                          defaultValue={rule.name}
                          autoComplete="off"
                        />

                        <TextField
                          label="Trigger SKUs"
                          name="triggerSkus"
                          multiline={4}
                          defaultValue={triggerSkus.join("\n")}
                          autoComplete="off"
                        />

                        <TextField
                          label="Offer SKUs"
                          name="offerSkus"
                          multiline={4}
                          defaultValue={offerSkus.join("\n")}
                          autoComplete="off"
                        />

                        <TextField
                          label="Priority"
                          name="priority"
                          type="number"
                          defaultValue={String(rule.priority)}
                          autoComplete="off"
                        />

                        <Checkbox
                          label="Active"
                          name="isActive"
                          defaultChecked={rule.isActive}
                        />

                        <InlineStack gap="200">
                          <Button submit loading={isSubmitting}>
                            Update
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Form>

                    <Form method="post">
                      <input type="hidden" name="_intent" value="delete" />
                      <input type="hidden" name="id" value={rule.id} />

                      <Button submit tone="critical" variant="secondary">
                        Delete
                      </Button>
                    </Form>
                  </BlockStack>
                </Card>
              );
            })}

            {rules.length === 0 && (
              <Card>
                <Text as="p">No bundler rules created yet.</Text>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}