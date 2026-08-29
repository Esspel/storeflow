import { createServerFn } from "@tanstack/react-start";

const SAP_BASE_URL = "https://s4r.sap.coop.se";

interface SapProductData {
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

interface FetchInput {
  storeId: string;
  sapArticleId: string;
}

export const fetchSapProductServerFn = createServerFn()
  .validator((input: FetchInput) => input)
  .handler(async ({ data }) => {
    const { storeId, sapArticleId } = data;
    const url = `${SAP_BASE_URL}/sap/opu/odata/sap/RETAILSTORE_ORDER_PRODUCT_SRV/StoreProducts(StoreID='${encodeURIComponent(storeId)}',ProductID='${encodeURIComponent(sapArticleId)}')?$format=json`;

    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "x-csrf-token": "fetch",
        },
      });

      if (!response.ok) {
        console.error(`SAP request failed with status ${response.status}`);
        return null;
      }

      const json = await response.json();
      return (json.d ?? null) as SapProductData | null;
    } catch (error) {
      console.error("SAP proxy error:", error);
      return null;
    }
  });
