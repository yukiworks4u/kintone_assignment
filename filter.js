(async () => {
  try {
    // --- Configuration ---
    const ORDERS_APP_ID = '13'; // Your "Orders" App ID

    // !!! IMPORTANT: VERIFY AND UPDATE THESE FIELD CODES !!!
    // Replace placeholder strings if your actual field codes are different.
    const FIELD_CODES = {
      order_id: "order_id",     // Field code for Order ID
      status: "Status",         // <<<< UPDATED based on your feedback
      order_type: "order_type", // Field code for Order Type (Sales/Purchase)
      item_lookup: "item_lookup",// Field code for Item Lookup (should contain the 4-digit item code)
      item_name: "item_name",   // Field code for Item Name
      quantity: "quantity"      // Field code for Quantity
    };

    // Item codes 0000 to 0020
    const ALL_ITEM_CODES = Array.from({ length: 21 }, (_, i) => String(i).padStart(4, '0'));

    // --- Helper Function to Fetch All Records with Pagination ---
    async function getAllKintoneRecords(appId, query, fieldsToRetrieve) {
      let allRecords = [];
      let offset = 0;
      const limit = 500; // Kintone API record limit per request

      while (true) {
        try {
          const params = {
            app: appId,
            query: `${query} limit ${limit} offset ${offset}`,
            fields: fieldsToRetrieve
          };
          const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', params);

          if (resp.records && resp.records.length > 0) {
            allRecords = allRecords.concat(resp.records);
            offset += resp.records.length;
            if (resp.records.length < limit) {
              break; // Fetched all records
            }
          } else {
            break; // No more records
          }
        } catch (error) {
          console.error(`Error fetching records for app ${appId} at offset ${offset}:`, error);
          if (error.errors) {
            console.error('Kintone API error details:', JSON.stringify(error.errors, null, 2));
          }
          throw error;
        }
      }
      return allRecords;
    }

    // --- Step #1: Extract specific order records from the Orders App ---
    console.log('Step #1: Fetching relevant order records...');
    // Query uses the field code for status
    const orderQuery = `${FIELD_CODES.status} in ("販売: 商品配達完了 (Sales: Delivered)", "購入: 購入完了 (Purchase: Closed/Paid)") order by ${FIELD_CODES.order_id} asc`;
    const fieldsToFetch = Object.values(FIELD_CODES);

    const relevantOrders = await getAllKintoneRecords(ORDERS_APP_ID, orderQuery, fieldsToFetch);

    // --- Step #2: Display the result in console for checking ---
    console.log('\n--- Step #2: Fetched Relevant Orders ---');
    if (relevantOrders.length > 0) {
      console.log(`Found ${relevantOrders.length} relevant orders:`);
      relevantOrders.forEach(record => {
        // Accessing fields using the defined FIELD_CODES
        console.log({
          order_id: record[FIELD_CODES.order_id]?.value,
          status: record[FIELD_CODES.status]?.value,
          order_type: record[FIELD_CODES.order_type]?.value,
          item_lookup: record[FIELD_CODES.item_lookup]?.value,
          item_name: record[FIELD_CODES.item_name]?.value,
          quantity: record[FIELD_CODES.quantity]?.value
        });
      });
    } else {
      console.log('No relevant orders found matching the criteria.');
    }

    // --- Step #3: Calculate how many items are in stock for all 21 items ---
    console.log('\n--- Step #3: Calculating Stock Levels ---');
    const stockLevels = {};

    // Initialize stock for all defined item codes to 0
    ALL_ITEM_CODES.forEach(code => {
      stockLevels[code] = 0;
    });

    relevantOrders.forEach(record => {
      const itemCode = record[FIELD_CODES.item_lookup]?.value;
      const quantityVal = record[FIELD_CODES.quantity]?.value;
      const orderType = record[FIELD_CODES.order_type]?.value;
      const orderIdForWarning = record[FIELD_CODES.order_id]?.value || 'N/A';

      if (!itemCode) {
          console.warn(`Warning: Order ID ${orderIdForWarning} has no item_lookup value. Skipping this record for stock calculation.`);
          return; // Skip if item code is missing
      }
      if (quantityVal === undefined || quantityVal === null) {
          console.warn(`Warning: Order ID ${orderIdForWarning} (Item: ${itemCode}) has no quantity value. Skipping this record for stock calculation.`);
          return; // Skip if quantity is missing
      }

      const quantity = parseInt(quantityVal, 10);

      if (isNaN(quantity)) {
        console.warn(`Warning: Order ID ${orderIdForWarning} (Item: ${itemCode}) has an invalid quantity: ${quantityVal}. Skipping this quantity calculation.`);
        return; // Skip if quantity is not a number
      }

      if (!stockLevels.hasOwnProperty(itemCode)) {
        // This handles cases where an item_lookup value might not be in ALL_ITEM_CODES
        // Potentially useful if new items are added and not yet in ALL_ITEM_CODES
        console.warn(`Warning: Item code "${itemCode}" from Order ID ${orderIdForWarning} was not in the predefined list of 21 items (0000-0020). It will be processed, but please check item codes in your 'Orders' app or the ALL_ITEM_CODES definition.`);
        stockLevels[itemCode] = 0;
      }

      if (orderType === '販売 (Sales)') {
        stockLevels[itemCode] -= quantity;
      } else if (orderType === '購入 (Purchase)') {
        stockLevels[itemCode] += quantity;
      }
    });

    console.log('\n--- Final Calculated Stock Levels ---');
    // Display stock for all 21 defined items, sorted
    ALL_ITEM_CODES.sort().forEach(itemCode => {
      console.log(`${itemCode}: ${stockLevels[itemCode]}`);
    });

    console.log('\n--- Script Finished ---');

  } catch (error) {
    console.error('An error occurred during the script execution:', error);
    let errorMessage = error.message;
    if (error.errors) { // Kintone API specific error details
        errorMessage += '\nDetails: ' + JSON.stringify(error.errors, null, 2);
    }
    console.error('Error details:', errorMessage);
  }
})();
