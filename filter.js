// Assume you have your App ID
const appId = 13; // Replace with your actual App ID

// Define your query conditions and sorting
const query = 'Status in ("販売: 商品配達完了 (Sales: Delivered)", "購入: 購入完了 (Purchase: Closed/Paid)") order by order_id asc limit 100 offset 0';
// - Status = "Pending": Filters for orders with the status "販売: 商品配達完了 (Sales: Delivered)".
// - order by order_id asc: Sorts the results by the "OrderDate" field in descending order (newest first).
// - limit 100: Retrieves a maximum of 100 records.
// - offset 0: Starts retrieving records from the beginning.

// Define the fields you want to retrieve
const fields = ['order_id','order_type', 'contact_lookup', 'item_lookup', 'item_name', 'quantity', 'Status']; // Replace with your actual field codes

// Construct the parameters for the API call
const params = {
  app: appId,
  query: query,
  fields: fields,
  totalCount: true // Optional: to get the total number of records matching the query
};

console.log("Requesting data from Kintone using Promises...");

kintone.api(kintone.api.url('/k/v1/records', true), 'GET', params)
  .then((resp) => {
    // Success: resp already contains the records and other info
    console.log(`Successfully retrieved ${resp.records.length} records.`);

    // The filtered records are in resp.records
    const retrievedRecords = resp.records;

    // Now you can use retrievedRecords for your next steps
    // For example, pass it to another function:
    return processFilteredDataWithPromise(retrievedRecords); // return a value or another promise for chaining
  })
  .then((processingResult) => {
    // This .then() executes after processFilteredDataWithPromise completes (if it returns a value or a resolved promise)
    console.log("Result from processing data:", processingResult);
    console.log("All steps completed successfully.");
  })
  .catch((error) => {
    // Error handling for any part of the chain
    console.error("Error during Kintone API call or processing:", error);
    // You might want to handle the error state for your next steps as well
    processFilteredDataWithPromise([]); // or handle error appropriately
  });

// Function to handle the next step, potentially returning a value or another Promise
function processFilteredDataWithPromise(data) {
  console.log("Processing the filtered data (Promise version)...");
  if (data && data.length > 0) {
    console.log(`Received ${data.length} records to process.`);
    let processedCount = 0;
    data.forEach(record => {
      console.log(`Processing Record ID: ${record.Record_number.value}, Status: ${record.Status.value}`);
      processedCount++;
    });
    console.log("Finished processing data.");
    return `Successfully processed ${processedCount} records.`; // Example return value
  } else {
    console.log("No data to process or an error occurred.");
    return "No data processed."; // Example return value
  }
  // If this function itself did something asynchronous, it could return a new Promise.
}
