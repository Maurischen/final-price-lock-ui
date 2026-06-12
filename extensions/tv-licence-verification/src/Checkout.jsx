import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [tvLicenceNumber, setTvLicenceNumber] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');

  const hasLoadedSavedValues = useRef(false);

  const appMetafields = shopify.appMetafields?.value || [];
  const lines = shopify.lines?.value || [];

  const getValue = (value) => String(value || '');

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

      setFullName(String(saved?.fullName || ''));
      setIdNumber(String(saved?.idNumber || ''));
      setTvLicenceNumber(String(saved?.tvLicenceNumber || ''));
      setContactNumber(String(saved?.contactNumber || ''));
      setEmailAddress(String(saved?.emailAddress || ''));
      setResidentialAddress(String(saved?.residentialAddress || ''));

      hasLoadedSavedValues.current = true;
    } catch (error) {
      console.error('Failed to parse saved TV licence verification data', error);
      hasLoadedSavedValues.current = true;
    }
  }, [savedFormJson]);

  async function saveForm(nextValues = {}) {
    if (!shopify.applyMetafieldChange) return;

    const payload = {
      fullName,
      idNumber,
      tvLicenceNumber,
      contactNumber,
      emailAddress,
      residentialAddress,
      ...nextValues,
    };

    const result = await shopify.applyMetafieldChange({
      type: 'updateCartMetafield',
      metafield: {
        namespace: '$app',
        key: 'tv_licence_verification',
        type: 'json',
        value: JSON.stringify(payload),
      },
    });

    if (result?.type === 'error') {
      console.error('Failed to save TV licence verification form', result.message);
    }
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
        value={fullName}
        onInput={(value) => setFullName(getValue(value))}
        onChange={async (value) => {
          const next = getValue(value);
          setFullName(next);
          await saveForm({fullName: next});
        }}
      />

      <s-text-field
        label="South African ID Number / Passport Number"
        value={idNumber}
        onInput={(value) => setIdNumber(getValue(value))}
        onChange={async (value) => {
          const next = getValue(value);
          setIdNumber(next);
          await saveForm({idNumber: next});
        }}
      />

      <s-text-field
        label="TV Licence Number (if available)"
        value={tvLicenceNumber}
        onInput={(value) => setTvLicenceNumber(getValue(value))}
        onChange={async (value) => {
          const next = getValue(value);
          setTvLicenceNumber(next);
          await saveForm({tvLicenceNumber: next});
        }}
      />

      <s-text-field
        label="Contact Number"
        value={contactNumber}
        onInput={(value) => setContactNumber(getValue(value))}
        onChange={async (value) => {
          const next = getValue(value);
          setContactNumber(next);
          await saveForm({contactNumber: next});
        }}
      />

      <s-text-field
        label="Email Address"
        value={emailAddress}
        onInput={(value) => setEmailAddress(getValue(value))}
        onChange={async (value) => {
          const next = getValue(value);
          setEmailAddress(next);
          await saveForm({emailAddress: next});
        }}
      />

      <s-text-field
        label="Residential Address linked to the TV Licence"
        value={residentialAddress}
        onInput={(value) => setResidentialAddress(getValue(value))}
        onChange={async (value) => {
          const next = getValue(value);
          setResidentialAddress(next);
          await saveForm({residentialAddress: next});
        }}
      />

      <s-text color="subdued">
        Copy of TV Licence / Proof of Payment upload will be added next.
      </s-text>
    </s-stack>
  );
}