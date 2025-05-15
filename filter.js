(async () => {
  try {
    // --- Configuration for "Orders" App ---
    const ORDERS_APP_ID = '13'; // Your "Orders" App ID

    // Field codes for "Orders" App (App ID 13) - VERIFY THESE
    const FIELD_CODES_ORDERS_APP = {
      order_id: "order_id",
      status: "Status",         // From your previous confirmation
      order_type: "order_type",
      item_lookup: "item_lookup", // This field in "Orders" app contains the 4-digit item code
      item_name: "item_name",
      quantity: "quantity"
    };

    // --- Configuration for "Items" App ---
    const ITEMS_APP_ID = '15'; // Your "Items" App ID

    // !!! IMPORTANT: VERIFY AND UPDATE THESE FIELD CODES for "Items" App (App ID 15) !!!
    const FIELD_CODES_ITEMS_APP = {
      item_code: "item_code", // <<<< UPDATE THIS: e.g., "item_code" or "ItemCode"
      stock: "stock"          // <<<< UPDATE THIS: e.g., "stock" or "CurrentStock"
    };

    // Item codes 0000 to 0020 for processing
    const ALL_ITEM_CODES = Array.from({ length: 21 }, (_, i) => String(i).padStart(4, '0'));

    // --- Helper Function to Fetch All Records with Pagination ---
    async function getAllKintoneRecords(appId, query, fieldsToRetrieve) {
      let allRecords = [];
      let offset = 0;
      const limit = 500;

      while (true) {
        try {
          const params = { app: appId, query: `${query} limit ${limit} offset ${offset}`, fields: fieldsToRetrieve };
          const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', params);
          if (resp.records && resp.records.length > 0) {
            allRecords = allRecords.concat(resp.records);
            offset += resp.records.length;
            if (resp.records.length < limit) break;
          } else break;
        } catch (error) {
          console.error(`Error fetching records for app ${appId} at offset ${offset}:`, error);
          if (error.errors) console.error('Kintone API error details:', JSON.stringify(error.errors, null, 2));
          throw error;
        }
      }
      return allRecords;
    }

    // --- PART 1: Calculate Stock Levels (from previous script) ---
    console.log('--- PART 1: Calculating Stock Levels ---');
    console.log('Step 1.1: Fetching relevant order records from "Orders" App...');
    const orderQuery = `${FIELD_CODES_ORDERS_APP.status} in ("販売: 商品配達完了 (Sales: Delivered)", "購入: 購入完了 (Purchase: Closed/Paid)") order by ${FIELD_CODES_ORDERS_APP.order_id} asc`;
    const fieldsToFetchFromOrders = Object.values(FIELD_CODES_ORDERS_APP);
    const relevantOrders = await getAllKintoneRecords(ORDERS_APP_ID, orderQuery, fieldsToFetchFromOrders);

    console.log('Step 1.2: Displaying fetched orders (for checking)...');
    if (relevantOrders.length > 0) {
      console.log(`Found ${relevantOrders.length} relevant orders.`);
      // relevantOrders.forEach(record => { // Optional: Log each record if needed for debugging
      //   console.log({
      //     order_id: record[FIELD_CODES_ORDERS_APP.order_id]?.value,
      //     item_lookup: record[FIELD_CODES_ORDERS_APP.item_lookup]?.value,
      //     quantity: record[FIELD_CODES_ORDERS_APP.quantity]?.value
      //   });
      // });
    } else {
      console.log('No relevant orders found matching the criteria.');
    }

    console.log('Step 1.3: Processing orders to calculate stock...');
    const stockLevels = {};
    ALL_ITEM_CODES.forEach(code => { stockLevels[code] = 0; });

    relevantOrders.forEach(record => {
      const itemCode = record[FIELD_CODES_ORDERS_APP.item_lookup]?.value;
      const quantityVal = record[FIELD_CODES_ORDERS_APP.quantity]?.value;
      const orderType = record[FIELD_CODES_ORDERS_APP.order_type]?.value;
      const orderIdForWarning = record[FIELD_CODES_ORDERS_APP.order_id]?.value || 'N/A';

      if (!itemCode || quantityVal === undefined || quantityVal === null) {
        // console.warn(`Skipping order ID ${orderIdForWarning} due to missing itemCode or quantity.`);
        return;
      }
      const quantity = parseInt(quantityVal, 10);
      if (isNaN(quantity)) {
        // console.warn(`Skipping order ID ${orderIdForWarning} due to invalid quantity: ${quantityVal}.`);
        return;
      }
      if (!stockLevels.hasOwnProperty(itemCode)) {
        // console.warn(`Item code "${itemCode}" from Order ID ${orderIdForWarning} not in ALL_ITEM_CODES. Initializing.`);
        stockLevels[itemCode] = 0;
      }
      if (orderType === '販売 (Sales)') stockLevels[itemCode] -= quantity;
      else if (orderType === '購入 (Purchase)') stockLevels[itemCode] += quantity;
    });

    console.log('\n--- Calculated Stock Levels (Ready for Update) ---');
    ALL_ITEM_CODES.sort().forEach(itemCode => {
      console.log(`${itemCode}: ${stockLevels[itemCode]}`);
    });

    // --- PART 2: Update Stock in "Items" App ---
    console.log('\n--- PART 2: Updating Stock in "Items" App (App ID: ' + ITEMS_APP_ID + ') ---');

    if (!FIELD_CODES_ITEMS_APP.item_code || item_code.item_code === "item_code" ||
        !FIELD_CODES_ITEMS_APP.stock || stock.stock === "stock") {
      console.error("ERROR: Please update the placeholder field codes in item_code before running Part 2.");
      throw new Error("Placeholder field codes for 'Items' app not updated.");
    }

    const recordsToUpdate = [];
    for (const itemCode in stockLevels) {
      if (stockLevels.hasOwnProperty(itemCode)) {
        recordsToUpdate.push({
          updateKey: {
            field: FIELD_CODES_ITEMS_APP.item_code, // Field code of 'item_code' in "Items" app
            value: itemCode                         // The actual item code value (e.g., "0000")
          },
          record: {
            [FIELD_CODES_ITEMS_APP.stock]: {        // Field code of 'stock' in "Items" app
              value: stockLevels[itemCode].toString() // Kintone number fields often expect strings
            }
          }
        });
      }
    }

    if (recordsToUpdate.length === 0) {
      console.log('No stock levels calculated, so no records to update in "Items" app.');
    } else {
      // Kintone API allows updating up to 100 records at a time.
      // Since we have 21 items, one API call is sufficient.
      console.log(`Preparing to update ${recordsToUpdate.length} item(s) in the "Items" app...`);
      try {
        const body = {
          app: ITEMS_APP_ID,
          records: recordsToUpdate
        };
        const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'PUT', body);
        console.log('Successfully updated stock in "Items" app!');
        console.log('API Response:', resp);
      } catch (error) {
        console.error('Error updating records in "Items" app:', error);
        if (error.errors) {
          console.error('Kintone API error details (update):', JSON.stringify(error.errors, null, 2));
        }
        // Common issue: If item_code field in "Items" app is not set to "Prohibit duplicate values"
        // or if an item_code from stockLevels doesn't exist in "Items" app, updateKey might fail.
        if (error.message && error.message.includes("GAIA_UQ01")) {
             console.error("Hint: This error (GAIA_UQ01) often means the 'updateKey' field (e.g., item_code) does not have 'Prohibit duplicate values' enabled, or the value does not exist in the target app.");
        }
      }
    }

    console.log('\n--- Script Finished ---');

  } catch (error) {
    console.error('An overall error occurred during the script execution:', error);
    let errorMessage = error.message;
    if (error.errors) {
        errorMessage += '\nDetails: ' + JSON.stringify(error.errors, null, 2);
    }
    console.error('Overall error details:', errorMessage);
  }
})();
