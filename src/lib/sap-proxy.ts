/**
 * SAP Proxy Client - Browser bridge for Chrome Extension
 *
 * Detects if the "Intern Proxy Bridge" Chrome Extension is installed
 * and provides a fetch function that routes requests through it.
 *
 * This bypasses CORS, PNA (Private Network Access), and SameSite restrictions
 * when calling internal SAP systems (s4r.sap.coop.se).
 */

declare global {
  var chrome: {
    runtime?: {
      sendMessage: (
        extensionId: string,
        message: unknown,
        callback?: (response: unknown) => void,
      ) => void;
      lastError?: { message: string };
    };
  };
}

// Extension ID for "Intern Proxy Bridge" - this is assigned by Chrome on installation.
// The actual ID is shown in chrome://extensions after loading the unpacked extension.
const EXTENSION_ID = "jfbjoaknkhddpdaeockdoediigpepbpo";

export interface ProxyResponse {
  success: boolean;
  status?: number;
  data?: string;
  error?: string;
}

interface SapProxyMessage {
  type: "PING" | "FETCH_INTERNAL";
  url?: string;
  method?: string;
  headers?: Record<string, string>;
}

interface SapProxyResponse {
  success: boolean;
  status?: string | number;
  data?: string;
  error?: string;
}

/**
 * Check if the Chrome Extension is installed and responding.
 * Sends a PING message and expects PONG response.
 */
export function checkExtensionInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    // Check if Chrome runtime is available
    if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
      return resolve(false);
    }

    chrome.runtime.sendMessage(
      EXTENSION_ID,
      { type: "PING" } as SapProxyMessage,
      (response: unknown) => {
        const resp = response as SapProxyResponse | undefined;
        if (chrome.runtime?.lastError) {
          // Extension svarade inte eller gav ett fel
          console.warn("[SAP Proxy] PING failed:", chrome.runtime.lastError.message);
          resolve(false);
        } else if (!resp || resp.status !== "PONG") {
          // Ogiltigt svar
          resolve(false);
        } else {
          resolve(true);
        }
      },
    );
  });
}

/**
 * Fetch data through the Chrome Extension proxy.
 * Used for making requests to internal SAP systems.
 */
export function fetchViaProxy(
  url: string,
  method: string = "GET",
  headers: Record<string, string> = {},
): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    if (!window.chrome || !chrome.runtime) {
      return reject(new Error("Chrome Extension är inte installerat eller tillgängligt."));
    }

    chrome.runtime.sendMessage(
      EXTENSION_ID,
      {
        type: "FETCH_INTERNAL",
        url: url,
        method: method,
        headers: headers,
      } as SapProxyMessage,
      (response: unknown) => {
        const resp = response as SapProxyResponse | undefined;
        if (chrome.runtime?.lastError) {
          const rawMsg = chrome.runtime.lastError.message;
          console.error("[SAP Proxy] Runtime error:", rawMsg);
          // Normalisera Chrome runtime-fel till kända transienta meddelanden
          // så att retryFetchViaProxy kan känna igen och retrya.
          const normalized =
            rawMsg.includes("Could not establish connection") ||
            rawMsg.includes("The message port closed") ||
            rawMsg.includes("Extension not found")
              ? "Runtime error"
              : rawMsg;
          return reject(new Error(normalized));
        }
        if (!resp) {
          console.error("[SAP Proxy] No response from extension");
          return reject(new Error("Inget svar från extensionen"));
        }
        if (resp.success) {
          resolve({
            success: true,
            status:
              typeof resp.status === "number" ? resp.status : parseInt(String(resp.status), 10),
            data: resp.data,
          });
        } else {
          console.error("[SAP Proxy] Extension returned error:", resp.error);
          reject(new Error(resp.error || "Okänt fel vid hämtning via proxy"));
        }
      },
    );
  });
}

/**
 * Parse SAP OData date format (e.g., "/Date(1234567890000)/") to ISO string.
 */
export function parseSapDate(dateValue: string | null | undefined): string | null {
  if (!dateValue) return null;
  const match = dateValue.match(/Date\((\d+)\)/);
  if (match) {
    return new Date(parseInt(match[1], 10)).toISOString();
  }
  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export interface SapProductData {
  ProductID: string;
  ProductName: string;
  MerchandiseCategory: string;
  MerchandiseCategoryName: string;
  RemainingShelfLifeInDays: string;
  Bnr: string;
  DeliveryDate: string | null;
  SalesPrice: string;
  GlobalTradeItemNumber: string;
}

/**
 * Väntar tills Chrome Extension är installerad och redo att ta emot meddelanden.
 *
 * Skickar PING-meddelanden med exponential backoff tills extensionen svarar med
 * PONG, eller tills maxAttempts uppnås. Används innan batchar av artiklar skickas
 * så att extensionen hinner initiera innan den första frågan.
 */
export async function ensureExtensionReady(
  maxAttempts: number = 10,
  baseDelayMs: number = 500,
): Promise<boolean> {
  // Vänta några sekunder så att Chrome Extension hinner vakna
  await new Promise((resolve) => setTimeout(resolve, 3000));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ok = await checkExtensionInstalled();
    if (ok) {
      console.log("[SAP Proxy] Chrome Extension redo — tar emot artiklar");
      return true;
    }
    if (attempt < maxAttempts - 1) {
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return false;
}

const SAP_BASE_URL = "https://s4r.sap.coop.se";

/**
 * Fetch data through the Chrome Extension proxy with retry logic.
 *
 * The "Intern Proxy Bridge" Chrome Extension can be slow to warm up on
 * the first request after page load — the first 1-2 requests often fail
 * with a transient "unknown error" before the connection is established.
 * This wrapper retries transient failures with exponential backoff.
 *
 * Only transient errors (chrome.runtime errors, missing responses) are
 * retried. Proxy-reported application errors are NOT retried.
 */
export async function fetchSapProductData(
  storeId: string,
  sapArticleId: string,
): Promise<SapProductData | null> {
  const url = `${SAP_BASE_URL}/sap/opu/odata/sap/RETAILSTORE_ORDER_PRODUCT_SRV/StoreProducts(StoreID='${encodeURIComponent(storeId)}',ProductID='${encodeURIComponent(sapArticleId)}')?$format=json`;
  console.log("[SAP Proxy] URL:", url);

  try {
    const data = await retryFetchViaProxy(url, "GET", {
      Accept: "application/json",
    });
    const jsonStr = typeof data === "string" ? data : (data.data ?? "");
    const json = JSON.parse(jsonStr);
    return (json.d ?? null) as SapProductData | null;
  } catch (err) {
    return null;
  }
}
