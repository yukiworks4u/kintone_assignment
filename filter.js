(async () => {
  try {
    // --- Configuration ---
    const ORDERS_APP_ID = '13';
    // According to your description, item codes are 4-digit numbers from 0000 to 0020.
    const ALL_ITEM_CODES = Array.from({ length: 21 }, (_, i) => String(i).padStart(4, '0'));

    // --- Helper Function to Fetch All Records with Pagination ---
    // Kintone's API typically returns a maximum of 500 records per call.
    // This function handles fetching all records by making multiple calls if necessary.
    async function getAllKintoneRecords(appId, query, fields) {
      let allRecords = [];
      let offset = 0;
      const limit = 500; // Kintone API record limit per request

      while (true) {
        try {
          const params = {
            app: appId,
            query: `${query} limit ${limit} offset ${offset}`,
            fields: fields
          };
          const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', params);

          if (resp.records && resp.records.length > 0) {
            allRecords = allRecords.concat(resp.records);
            offset += resp.records.length;
            if (resp.records.length < limit) {
              break; // Fetched all records
            }
          } else {
            break; // No more records or an error occurred
          }
        } catch (error) {
          console.error(`Error fetching records for app ${appId} at offset ${offset}:`, error);
          throw error; // Re-throw to stop execution if a fetch fails
        }
      }
      return allRecords;
    }

    // --- Step #1: Extract specific order records from the Orders App ---
    console.log('Step #1: Fetching relevant order records...');
    const orderQuery = 'status in ("販売: 商品配達完了 (Sales: Delivered)", "購入: 購入完了 (Purchase: Closed/Paid)") order by order_id asc';
    const orderFields = ['order_id', 'status', 'order_type', 'item_lookup', 'item_name', 'quantity'];

    const relevantOrders = await getAllKintoneRecords(ORDERS_APP_ID, orderQuery, orderFields);

    // --- Step #2: Display the result in console for checking ---
    console.log('\n--- Step #2: Fetched Relevant Orders ---');
    if (relevantOrders.length > 0) {
      console.log(`Found ${relevantOrders.length} relevant orders:`);
      relevantOrders.forEach(record => {
        console.log({
          order_id: record.order_id.value,
          status: record.status.value,
          order_type: record.order_type.value,
          item_lookup: record.item_lookup.value, // This should be the item_code
          item_name: record.item_name.value,
          quantity: record.quantity.value
        });
      });
    } else {
      console.log('No relevant orders found matching the criteria.');
    }

    // --- Step #3: Calculate how many items are in stock for all 21 items ---
    console.log('\n--- Step #3: Calculating Stock Levels ---');
    const stockLevels = {};

    // Initialize stock for all 21 items to 0
    ALL_ITEM_CODES.forEach(code => {
      stockLevels[code] = 0;
    });

    relevantOrders.forEach(record => {
      const itemCode = record.item_lookup.value; // This is the item_code (e.g., "0000", "0001", etc.)
      const quantity = parseInt(record.quantity.value, 10);
      const orderType = record.order_type.value;

      if (isNaN(quantity)) {
        console.warn(`Warning: Order ID ${record.order_id.value} has an invalid quantity: ${record.quantity.value}. Skipping this quantity calculation.`);
        return; // Skip if quantity is not a valid number
      }

      if (!stockLevels.hasOwnProperty(itemCode)) {
        // This case should ideally not happen if ALL_ITEM_CODES is comprehensive
        // and item_lookup values are always within that range.
        // However, it's a good safeguard or indicator of unexpected item_lookup values.
        console.warn(`Warning: Item code "${itemCode}" from Order ID ${record.order_id.value} was not in the predefined list of 21 items. It will be processed, but please check item codes.`);
        stockLevels[itemCode] = 0;
      }

      if (orderType === '販売 (Sales)') {
        stockLevels[itemCode] -= quantity;
      } else if (orderType === '購入 (Purchase)') {
        stockLevels[itemCode] += quantity;
      }
    });

    console.log('\n--- Final Calculated Stock Levels ---');
    // Display stock for all 21 defined items, sorted by item code
    ALL_ITEM_CODES.sort().forEach(itemCode => {
      console.log(`${itemCode}: ${stockLevels[itemCode]}`);
    });

    console.log('\n--- Script Finished ---');

  } catch (error) {
    console.error('An error occurred during the script execution:', error);
    let errorMessage = error.message;
    if (error.errors) { // Kintone API specific error
        errorMessage += '\nDetails: ' + JSON.stringify(error.errors, null, 2);
    }
    console.error('Error details:', errorMessage);
  }
})();
