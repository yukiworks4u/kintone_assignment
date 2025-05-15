kintone.events.on('app.record.index.show', (event) => {

// adding filter_v9

(async () => {
  try {
    console.log('--- Starting Stock Calculation and Update Script ---');

    // --- Configuration for "Orders" App ---
    const ORDERS_APP_ID = '13'; // Your "Orders" App ID

    // Field codes for "Orders" App (App ID 13) - VERIFY THESE
    const FIELD_CODES_ORDERS_APP = {
      order_id: "order_id", // Example: 'order_id_field'
      status: "Status", // Example: 'order_status'
      order_type: "order_type", // Example: 'type' (e.g., Sales, Purchase)
      item_lookup: "item_lookup", // Example: 'item_code_field_in_orders' - This field should link to your Items app item code
      item_name: "item_name", // Example: 'item_name_field_in_orders'
      quantity: "quantity" // Example: 'quantity_field'
    };
    // Ensure the field codes above match your "Orders" App exactly.

    // --- Configuration for "Items" App ---
    const ITEMS_APP_ID = '15'; // Your "Items" App ID

    // !!! IMPORTANT: ONLY EDIT THE STRING VALUES IN THIS SECTION !!!
    // Replace "YOUR_..." with the actual field codes from your "Items" App (App ID 15)
    const FIELD_CODES_ITEMS_APP = {
      item_code: "item_code", // <<<< UPDATE THIS STRING e.g., "ProductSKU" - This is the unique identifier field in your Items app
      stock: "stock" // <<<< UPDATE THIS STRING e.g., "stock_on_hand" - This is the number field you want to update
    };
    // DO NOT change any other part of the script unless you are sure.
    // Verify these field codes match your "Items" App exactly.

    // --- Helper Function to Fetch All Records with Pagination ---
    async function getAllKintoneRecords(appId, query, fieldsToRetrieve) {
      let allRecords = [];
      let offset = 0;
      const limit = 500; // **FIXED: Changed from 550 to 500**
      while (true) {
        try {
          const params = { app: appId, query: `${query} limit ${limit} offset ${offset}`, fields: fieldsToRetrieve };
          const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', params);
          if (!resp.records || resp.records.length === 0) break; // No more records

          allRecords = allRecords.concat(resp.records);
          offset += resp.records.length;

          // If the number of records fetched is less than the limit, we've got the last batch
          if (resp.records.length < limit) break;

        } catch (error) {
          console.error(`Error fetching records for app ${appId} at offset ${offset}:`, error);
          if (error.errors) console.error('Kintone API error details:', JSON.stringify(error.errors, null, 2));
          throw error;
        }
      }
      return allRecords;
    }

    // --- PART 0: Fetch All Item Codes from Items App ---
    console.log('--- PART 0: Fetching Item Codes from "Items" App ---');

    if (!FIELD_CODES_ITEMS_APP.item_code || FIELD_CODES_ITEMS_APP.item_code.includes("YOUR_")) {
        console.error("ERROR: Please update the placeholder for FIELD_CODES_ITEMS_APP.item_code with your actual item code field name from the 'Items' app.");
        throw new Error("Placeholder field code for 'Items' app item_code not updated. Script halted.");
    }

    console.log(`Step 0.1: Fetching all item codes from "Items" App (App ID: ${ITEMS_APP_ID})...`);
    // Fetch only the item code field from the Items app
    const itemRecords = await getAllKintoneRecords(ITEMS_APP_ID, '', [FIELD_CODES_ITEMS_APP.item_code]);

    if (itemRecords.length === 0) {
        console.warn('Warning: No items found in the "Items" App. Stock calculation cannot proceed.');
        // It's okay to continue if no items, stockLevels will be empty and no updates will occur.
    }

    // Extract unique item codes from the fetched records
    const allItemCodes = new Set();
    itemRecords.forEach(record => {
        const itemCodeValue = record[FIELD_CODES_ITEMS_APP.item_code]?.value;
        if (itemCodeValue) {
            allItemCodes.add(itemCodeValue);
        }
    });

    const dynamicItemCodeList = Array.from(allItemCodes);
    console.log(`Step 0.2: Found ${dynamicItemCodeList.length} unique item codes in the "Items" App.`);
    // console.log('Discovered Item Codes:', dynamicItemCodeList.sort().join(', ')); // Uncomment for debugging if needed

    // --- PART 1: Calculate Stock Levels ---
    console.log('\n--- PART 1: Calculating Stock Levels ---');
    console.log(`Step 1.1: Fetching relevant order records from "Orders" App (App ID: ${ORDERS_APP_ID})...`);

    // Construct the query to filter relevant orders
    // Note: The query uses the actual field codes defined in FIELD_CODES_ORDERS_APP
    const orderQuery = `${FIELD_CODES_ORDERS_APP.status} in ("販売: 商品配達完了 (Sales: Delivered)", "購入: 購入完了 (Purchase: Closed/Paid)") order by ${FIELD_CODES_ORDERS_APP.order_id} asc`;
    const fieldsToFetchFromOrders = Object.values(FIELD_CODES_ORDERS_APP);

    const relevantOrders = await getAllKintoneRecords(ORDERS_APP_ID, orderQuery, fieldsToFetchFromOrders);

    console.log('Step 1.2: Displaying fetched orders count...');
    if (relevantOrders.length > 0) {
      console.log(`Found ${relevantOrders.length} relevant orders.`);
    } else {
      console.log('No relevant orders found matching the criteria. Stock levels will be based on current Items app state.');
    }

    console.log('Step 1.3: Processing orders to calculate stock...');
    // Initialize stock levels based on the items found in the "Items" app
    const stockLevels = {};
    dynamicItemCodeList.forEach(code => { stockLevels[code] = 0; });

    relevantOrders.forEach(record => {
      const itemCodeValue = record[FIELD_CODES_ORDERS_APP.item_lookup]?.value;
      const quantityVal = record[FIELD_CODES_ORDERS_APP.quantity]?.value;
      const orderType = record[FIELD_CODES_ORDERS_APP.order_type]?.value;
      // const orderIdForWarning = record[FIELD_CODES_ORDERS_APP.order_id]?.value || 'N/A'; // Uncomment if you need the order ID for logging issues

      if (!itemCodeValue || quantityVal === undefined || quantityVal === null) {
        // console.warn(`Skipping record ${orderIdForWarning} due to missing item code or quantity.`); // Uncomment for debugging
        return; // Skip records missing essential data
      }

      const quantity = parseInt(quantityVal, 10);
      if (isNaN(quantity)) {
         console.warn(`Skipping record for item "${itemCodeValue}" in order due to invalid quantity: "${quantityVal}"`); // Log if quantity is not a valid number
         return; // Skip if quantity is not a valid number
      }

      // If an item code appears in orders but wasn't in the initial Items app fetch, add it to stockLevels
      if (!stockLevels.hasOwnProperty(itemCodeValue)) {
         console.warn(`Item code "${itemCodeValue}" found in orders but not in the "Items" app. Adding it to calculation.`);
         stockLevels[itemCodeValue] = 0;
      }

      // Update stock based on order type
      if (orderType === '販売 (Sales)') {
         stockLevels[itemCodeValue] -= quantity;
      } else if (orderType === '購入 (Purchase)') {
         stockLevels[itemCodeValue] += quantity;
      } else {
         console.warn(`Skipping item "${itemCodeValue}" in order due to unrecognized order type: "${orderType}"`); // Log if order type is not recognized
      }
    });

    console.log('\n--- Calculated Stock Levels (Ready for Update) ---');
    // Sort item codes for consistent output
    const sortedItemCodes = Object.keys(stockLevels).sort();
     if (sortedItemCodes.length > 0) {
         sortedItemCodes.forEach(itemCode => {
             console.log(`${itemCode}: ${stockLevels[itemCode]}`);
         });
     } else {
         console.log('No item codes found to display calculated stock.');
     }


    // --- PART 2: Update Stock in "Items" App ---
    console.log('\n--- PART 2: Updating Stock in "Items" App (App ID: ' + ITEMS_APP_ID + ') ---');

    if (!FIELD_CODES_ITEMS_APP.stock || FIELD_CODES_ITEMS_APP.stock.includes("YOUR_")) {
      console.error("ERROR: Please update the placeholder for FIELD_CODES_ITEMS_APP.stock with your actual stock field name from the 'Items' app.");
      throw new Error("Placeholder field code for 'Items' app stock not updated. Script halted.");
    }

    const recordsToUpdate = [];
    // Iterate through the calculated stock levels
    for (const itemCode in stockLevels) {
      // Only include items that were originally from the Items app fetch for updating
      // This prevents trying to update items that only exist in orders but not in the Items app
      if (stockLevels.hasOwnProperty(itemCode) && dynamicItemCodeList.includes(itemCode)) {
        recordsToUpdate.push({
          updateKey: {
            // This line tells Kintone which field in your "Items" app to use for matching.
            // It should be the field code you specified for item_code in FIELD_CODES_ITEMS_APP.
            field: FIELD_CODES_ITEMS_APP.item_code, // CRITICAL: Do not change this line's structure
            // This is the actual value (e.g., "0000") to find in that field.
            value: itemCode
          },
          record: {
            // This specifies which field to update and its new value.
            [FIELD_CODES_ITEMS_APP.stock]: {
              value: stockLevels[itemCode].toString() // Kintone API often expects number values as strings
            }
          }
        });
      } else if (stockLevels.hasOwnProperty(itemCode) && !dynamicItemCodeList.includes(itemCode)) {
          console.warn(`Skipping update for item code "${itemCode}" as it was found in orders but does not exist in the "Items" app.`);
      }
    }

    if (recordsToUpdate.length === 0) {
      console.log('No items found in the "Items" app to update, or no stock changes calculated.');
    } else {
      console.log(`Preparing to update ${recordsToUpdate.length} item(s) in the "Items" app...`);
      // Kintone's update records API has a limit (max 100 records per PUT call)
      const updateLimit = 100;
      for (let i = 0; i < recordsToUpdate.length; i += updateLimit) {
          const batchToUpdate = recordsToUpdate.slice(i, i + updateLimit);
          console.log(`Updating batch ${Math.floor(i/updateLimit) + 1}/${Math.ceil(recordsToUpdate.length/updateLimit)} (${batchToUpdate.length} records)...`);
          try {
              const body = { app: ITEMS_APP_ID, records: batchToUpdate };
              const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'PUT', body);
              // console.log('Batch update successful:', resp); // Uncomment for debugging
          } catch (error) {
              console.error(`Error updating batch ${Math.floor(i/updateLimit) + 1} in "Items" app:`, error);
              if (error.errors) {
                  console.error('Kintone API error details (update batch):', JSON.stringify(error.errors, null, 2));
                  if (JSON.stringify(error.errors).includes("GAIA_UQ01")) {
                       console.error("Hint: GAIA_UQ01 error often means the 'updateKey' field (e.g., your item_code field) does not have 'Prohibit duplicate values' enabled in the 'Items' app settings, or an item code value from your orders/calculation does not exist in the 'Items' app (although the script now tries to avoid updating items not found in the initial fetch).");
                  }
              }
              // Depending on your needs, you might want to stop or continue after a batch error
              // throw error; // Uncomment this line to stop execution on the first batch error
          }
      }
      console.log('Completed all update batches for "Items" app!');
    }

    console.log('\n--- Script Finished Successfully ---');

  } catch (error) {
    console.error('An overall error occurred during the script execution:', error);
    let errorMessage = error.message;
    // Add more detail if Kintone errors object is present
    if (error.errors && typeof error.errors === 'object') {
        errorMessage += '\nDetails: ' + JSON.stringify(error.errors, null, 2);
    } else if (error.errors) {
        errorMessage += '\nDetails: ' + error.errors;
    }
    console.error('Overall error details:', errorMessage);
    console.error('\n--- Script Finished with Errors ---');
  }
})();

// filter_v9 ends here!

return event;
});
