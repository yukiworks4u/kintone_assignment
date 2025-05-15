(async () => {
  try {
    // --- Configuration for "Orders" App ---
    const ORDERS_APP_ID = '13'; // Your "Orders" App ID

    // Field codes for "Orders" App (App ID 13) - VERIFY THESE
    const FIELD_CODES_ORDERS_APP = {
      order_id: "order_id",
      status: "Status",
      order_type: "order_type",
      item_lookup: "item_lookup",
      item_name: "item_name",
      quantity: "quantity"
    };

    // --- Configuration for "Items" App ---
    const ITEMS_APP_ID = '15'; // Your "Items" App ID

    // !!! IMPORTANT: ONLY EDIT THE STRING VALUES IN THIS SECTION !!!
    // Replace "YOUR_..." with the actual field codes from your "Items" App (App ID 15)
    // For example, if your item code field is "ProductSKU", change it to: item_code: "ProductSKU"
    const FIELD_CODES_ITEMS_APP = {
      item_code: "YOUR_ITEM_CODE_FIELD_IN_ITEMS_APP", // <<<< UPDATE THIS STRING e.g., "item_code_actual"
      stock: "YOUR_STOCK_FIELD_IN_ITEMS_APP"          // <<<< UPDATE THIS STRING e.g., "stock_on_hand"
    };
    // DO NOT change any other part of the script unless you are sure.

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

    // --- PART 1: Calculate Stock Levels ---
    console.log('--- PART 1: Calculating Stock Levels ---');
    console.log('Step 1.1: Fetching relevant order records from "Orders" App...');
    const orderQuery = `${FIELD_CODES_ORDERS_APP.status} in ("販売: 商品配達完了 (Sales: Delivered)", "購入: 購入完了 (Purchase: Closed/Paid)") order by ${FIELD_CODES_ORDERS_APP.order_id} asc`;
    const fieldsToFetchFromOrders = Object.values(FIELD_CODES_ORDERS_APP);
    const relevantOrders = await getAllKintoneRecords(ORDERS_APP_ID, orderQuery, fieldsToFetchFromOrders);

    console.log('Step 1.2: Displaying fetched orders (for checking)...');
    if (relevantOrders.length > 0) {
      console.log(`Found ${relevantOrders.length} relevant orders.`);
    } else {
      console.log('No relevant orders found matching the criteria.');
    }

    console.log('Step 1.3: Processing orders to calculate stock...');
    const stockLevels = {};
    ALL_ITEM_CODES.forEach(code => { stockLevels[code] = 0; });

    relevantOrders.forEach(record => {
      const itemCodeValue = record[FIELD_CODES_ORDERS_APP.item_lookup]?.value; // Renamed to avoid confusion with loop var
      const quantityVal = record[FIELD_CODES_ORDERS_APP.quantity]?.value;
      const orderType = record[FIELD_CODES_ORDERS_APP.order_type]?.value;
      const orderIdForWarning = record[FIELD_CODES_ORDERS_APP.order_id]?.value || 'N/A';

      if (!itemCodeValue || quantityVal === undefined || quantityVal === null) return;
      const quantity = parseInt(quantityVal, 10);
      if (isNaN(quantity)) return;
      if (!stockLevels.hasOwnProperty(itemCodeValue)) {
        stockLevels[itemCodeValue] = 0;
      }
      if (orderType === '販売 (Sales)') stockLevels[itemCodeValue] -= quantity;
      else if (orderType === '購入 (Purchase)') stockLevels[itemCodeValue] += quantity;
    });

    console.log('\n--- Calculated Stock Levels (Ready for Update) ---');
    ALL_ITEM_CODES.sort().forEach(itemCode => { // 'itemCode' here is the key from ALL_ITEM_CODES
      console.log(`${itemCode}: ${stockLevels[itemCode]}`);
    });

    // --- PART 2: Update Stock in "Items" App ---
    console.log('\n--- PART 2: Updating Stock in "Items" App (App ID: ' + ITEMS_APP_ID + ') ---');

    if (!FIELD_CODES_ITEMS_APP.item_code || FIELD_CODES_ITEMS_APP.item_code === "YOUR_ITEM_CODE_FIELD_IN_ITEMS_APP" ||
        !FIELD_CODES_ITEMS_APP.stock || FIELD_CODES_ITEMS_APP.stock === "YOUR_STOCK_FIELD_IN_ITEMS_APP") {
      console.error("ERROR: Please update the placeholder field codes in FIELD_CODES_ITEMS_APP with your actual field codes for the 'Items' app.");
      throw new Error("Placeholder field codes for 'Items' app not updated. Script halted.");
    }

    const recordsToUpdate = [];
    // 'itemCodeKey' is the key from the stockLevels object (e.g., "0000", "0001")
    for (const itemCodeKey in stockLevels) {
      if (stockLevels.hasOwnProperty(itemCodeKey)) {
        recordsToUpdate.push({
          updateKey: {
            // This line tells Kintone which field in your "Items" app to use for matching.
            // It should be the field code you specified for item_code in FIELD_CODES_ITEMS_APP.
            field: FIELD_CODES_ITEMS_APP.item_code, // CRITICAL: Do not change this line's structure
            // This is the actual value (e.g., "0000") to find in that field.
            value: itemCodeKey
          },
          record: {
            // This specifies which field to update and its new value.
            [FIELD_CODES_ITEMS_APP.stock]: {
              value: stockLevels[itemCodeKey].toString()
            }
          }
        });
      }
    }

    if (recordsToUpdate.length === 0) {
      console.log('No stock levels calculated or no items to update in "Items" app.');
    } else {
      console.log(`Preparing to update ${recordsToUpdate.length} item(s) in the "Items" app...`);
      try {
        const body = { app: ITEMS_APP_ID, records: recordsToUpdate };
        const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'PUT', body);
        console.log('Successfully updated stock in "Items" app!');
        console.log('API Response:', resp);
      } catch (error) {
        console.error('Error updating records in "Items" app:', error);
        if (error.errors) console.error('Kintone API error details (update):', JSON.stringify(error.errors, null, 2));
        if (error.message && error.message.includes("GAIA_UQ01")) {
             console.error("Hint: This error (GAIA_UQ01) often means the 'updateKey' field (e.g., the one you specified as FIELD_CODES_ITEMS_APP.item_code) either does not have 'Prohibit duplicate values' enabled in the 'Items' app settings, or an item code value from your orders does not exist in the 'Items' app.");
        }
      }
    }

    console.log('\n--- Script Finished ---');

  } catch (error) {
    console.error('An overall error occurred during the script execution:', error);
    let errorMessage = error.message;
    if (error.errors && typeof error.errors === 'object') { // Check if error.errors is an object
        errorMessage += '\nDetails: ' + JSON.stringify(error.errors, null, 2);
    } else if (error.errors) { // If it's not an object but exists (e.g. a string)
        errorMessage += '\nDetails: ' + error.errors;
    }
    console.error('Overall error details:', errorMessage);
  }
})();
