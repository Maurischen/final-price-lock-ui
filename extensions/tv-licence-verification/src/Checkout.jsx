import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

export default function extension() {
  render(<Extension />, document.body);
}

const EMPTY_FORM = {
  fullName: '',
  idNumber: '',
  tvLicenceNumber: '',
  contactNumber: '',
  emailAddress: '',
  residentialAddress: '',
};

function Extension() {
  const [form, setForm] = useState(EMPTY_FORM);
  const hasLoadedSavedValues = useRef(false);

  const appMetafields = shopify.appMetafields?.value || [];
  const lines = shopify.lines?.value || [];

  const getValue = (event) => {
    return String(event?.target?.value ?? event?.currentTarget?.value ?? event ?? '');
  };

  const getNumericProductId = (gid) => {
    const match = String(gid || '').match(/(\d+)$/);
    return match ? match[1] : null;
  };

  const tvVerificationProductIds = new Set(
    appMetafields
      .filter((entry) => {
        return (
          entry?.target?.type === 'product' &&
          entry?.metafield?.namespace === 'custom' &&
          entry?.metafield?.key === 'requires_tv_licence_verification' &&
          String(entry?.metafield?.value).toLowerCase() === 'true'
        );
      })
      .map((entry) => String(entry?.target?.id))
      .filter(Boolean),
  );

  const hasTvInCart = lines.some((line) => {
    const productGid = line?.merchandise?.product?.id;
    const numericProductId = getNumericProductId(productGid);
    return numericProductId && tvVerificationProductIds.has(numericProductId);
  });

  const savedFormEntry = appMetafields.find((entry) => {
    return (
      entry?.target?.type === 'cart' &&
      entry?.metafield?.namespace === '$app' &&
      entry?.metafield?.key === 'tv_licence_verification'
    );
  });

  const savedFormJson = savedFormEntry?.metafield?.value;

  useEffect(() => {
    if (hasLoadedSavedValues.current) return;
    if (!savedFormJson) return;

    try {
      const saved = JSON.parse(savedFormJson);

      setForm({
        fullName: String(saved?.fullName || ''),
        idNumber: String(saved?.idNumber || ''),
        tvLicenceNumber: String(saved?.tvLicenceNumber || ''),
        contactNumber: String(saved?.contactNumber || ''),
        emailAddress: String(saved?.emailAddress || ''),
        residentialAddress: String(saved?.residentialAddress || ''),
      });
    } catch (error) {
      console.error('Failed to parse saved TV licence verification data', error);
    }

    hasLoadedSavedValues.current = true;
  }, [savedFormJson]);

  async function saveForm(nextForm) {
    if (!shopify.applyMetafieldChange) return;

    const result = await shopify.applyMetafieldChange({
      type: 'updateCartMetafield',
      metafield: {
        namespace: '$app',
        key: 'tv_licence_verification',
        type: 'json',
        value: JSON.stringify(nextForm),
      },
    });

    if (result?.type === 'error') {
      console.error('Failed to save TV licence verification form', result.message);
    }
  }

  function updateField(field, event) {
    const nextValue = getValue(event);

    const nextForm = {
      ...form,
      [field]: nextValue,
    };

    setForm(nextForm);
    saveForm(nextForm);
  }

  if (!hasTvInCart) {
    return null;
  }

  return (
    <s-stack gap="base">
      <s-banner heading="TV licence verification" tone="info">
        <s-text>
          Please complete the details below for TV licence verification when purchasing a television.
        </s-text>
      </s-banner>

      <s-text-field
        label="Full Name and Surname"
        value={form.fullName}
        onInput={(event) => updateField('fullName', event)}
      />

      <s-text-field
        label="South African ID Number / Passport Number"
        value={form.idNumber}
        onInput={(event) => updateField('idNumber', event)}
      />

      <s-text-field
        label="TV Licence Number (if available)"
        value={form.tvLicenceNumber}
        onInput={(event) => updateField('tvLicenceNumber', event)}
      />

      <s-text-field
        label="Contact Number"
        value={form.contactNumber}
        onInput={(event) => updateField('contactNumber', event)}
      />

      <s-text-field
        label="Email Address"
        value={form.emailAddress}
        onInput={(event) => updateField('emailAddress', event)}
      />

      <s-text-field
        label="Residential Address linked to the TV Licence"
        value={form.residentialAddress}
        onInput={(event) => updateField('residentialAddress', event)}
      />

      <s-text color="subdued">
        Copy of TV Licence / Proof of Payment upload will be added next.
      </s-text>
    </s-stack>
  );
}